import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { generateCredentialPng } from '../services/credential.js';
import { sendCredentialEmail } from '../services/email.js';
import { rateLimit } from '../utils/rateLimit.js';
import { requireStaffSession } from '../middleware/requireStaffSession.js';
import { requireRole } from '../middleware/requireRole.js';
import { recordAudit } from '../services/auth/auditService.js';

// Tier de autorización (ver docs/migration-v2/05-authorization-matrix.md):
//   GET    /:code.png    → PUBLIC bearer-style  (código actúa como token portador)
//   POST   /:code/send   → STAFF + audit log    (V008b · antes sin auth)
//   POST   /bulk-send    → ADMIN/OWNER          (operación masiva)
//
// Política del GET público:
//   - Sin auth (el visitante descarga su credencial desde el link en su email)
//   - PNG contiene solo: nombre del visitante + código CCB + QR + branding
//   - NO contiene email (removido para limitar PII portable si el link se reenvía)
//   - Rate limit por IP (60 req/min) — la regex estricta `[A-Z]{2,6}-[A-Z0-9]{6}`
//     hace inviable brute-force, pero el limit corta enumeración por timing
//   - Sin información que distinga "código no existe" de "error interno"
//     más allá del status code (404 vs 500)

// Rate limit para POST /:code/send — defensa contra spam aun con sesión.
const credentialSendLimit = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: 'Demasiados envíos de credencial. Espera un minuto.',
});

// Rate limit para GET /:code.png — corta enumeración masiva por timing.
// El endpoint es público, así que es la única defensa de capa de red.
const credentialPngLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  message: 'Demasiadas descargas. Intenta en un momento.',
});

export function createCredentialsRouter() {
  const router = Router();

  router.get('/:code.png', credentialPngLimit, async (req, res, next) => {
    try {
      const code = String(req.params.code || '').toUpperCase();
      if (!/^[A-Z]{2,6}-[A-Z0-9]{6}$/.test(code)) {
        throw new HttpError(400, 'Formato de código inválido');
      }
      const user = await req.repos.users.findByCode(code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const png = await generateCredentialPng(user, req.organization);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Content-Disposition', `inline; filename="credencial-${code}.png"`);
      res.send(png);
    } catch (e) {
      next(e);
    }
  });

  router.post('/:code/send', requireStaffSession, credentialSendLimit, async (req, res, next) => {
    try {
      const code = String(req.params.code || '').toUpperCase();
      if (!/^[A-Z]{2,6}-[A-Z0-9]{6}$/.test(code)) {
        throw new HttpError(400, 'Formato de código inválido');
      }
      const user = await req.repos.users.findByCode(code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      if (!user.email) {
        throw new HttpError(400, 'El usuario no tiene email registrado');
      }
      const result = await sendCredentialEmail(user, req.organization);
      if (result.skipped) {
        return res.status(202).json({
          ok: false,
          message: result.reason === 'sin RESEND_API_KEY'
            ? 'Modo desarrollo: credencial generada pero no enviada (falta RESEND_API_KEY)'
            : 'Email no enviado',
          ...result,
        });
      }
      if (!result.sent) {
        return res.status(502).json({ ok: false, error: result.error });
      }
      // Marca el timestamp de credencial enviada (para que la UI sepa el estado)
      await req.repos.users.markCredentialSent(user.code).catch(() => {});
      // Audit log de la acción (PII enmascarada).
      recordAudit({
        req,
        action: 'credential.sent',
        targetType: 'user',
        targetId: user.id,
        targetLabel: user.code,
        metadata: { resendId: result.id || null, emailMasked: user.email ? user.email.replace(/^(.).+(@.+)$/, '$1***$2') : null },
      }).catch(() => {});
      res.json({ ok: true, id: result.id, email: user.email });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/credentials/bulk-send
  // Despacha credenciales en lote (staff-only). Procesa serial con throttle
  // interno para respetar el rate limit de Resend (~10 req/s). Devuelve
  // un summary + array detallado con resultado por código. No hereda el
  // rate limit del endpoint singular: la operación está auth-gated por staff.
  router.post('/bulk-send', requireStaffSession, requireRole(['owner', 'admin']), async (req, res, next) => {
    try {
      const codes = Array.isArray(req.body?.codes) ? req.body.codes : null;
      if (!codes || codes.length === 0) {
        throw new HttpError(400, 'Body debe contener { codes: [...] } no vacío');
      }
      if (codes.length > 1000) {
        throw new HttpError(400, 'Máximo 1000 credenciales por lote');
      }
      const throttleMs = Math.max(0, Math.min(2000, Number(req.body?.throttleMs) || 150));

      const results = [];
      for (const raw of codes) {
        const code = String(raw || '').toUpperCase();
        if (!/^[A-Z]{2,6}-[A-Z0-9]{6}$/.test(code)) {
          results.push({ code, ok: false, error: 'invalid-format' });
          continue;
        }
        const user = await req.repos.users.findByCode(code);
        if (!user) {
          results.push({ code, ok: false, error: 'not-found' });
          continue;
        }
        if (!user.email) {
          results.push({ code, ok: false, skipped: true, reason: 'no-email' });
          continue;
        }
        try {
          const r = await sendCredentialEmail(user, req.organization);
          if (r.sent) {
            results.push({ code, ok: true, id: r.id });
            await req.repos.users.markCredentialSent(code).catch(() => {});
          } else if (r.skipped) {
            results.push({ code, ok: false, skipped: true, reason: r.reason });
          } else {
            results.push({ code, ok: false, error: r.error });
          }
        } catch (e) {
          results.push({ code, ok: false, error: e.message });
        }
        if (throttleMs > 0) await new Promise(r => setTimeout(r, throttleMs));
      }
      const summary = {
        total: codes.length,
        sent: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok && !r.skipped).length,
        skipped: results.filter(r => r.skipped).length,
      };
      res.json({ summary, results });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
