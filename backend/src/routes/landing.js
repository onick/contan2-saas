// =============================================================================
// landing.js · endpoint público del formulario de contacto de la landing.
// NO tiene tenant scope (vive en el marketing host).
// =============================================================================

import { Router } from 'express';
import { z } from 'zod';
import { Resend } from 'resend';
import { HttpError } from '../middleware/errorHandler.js';
import { rateLimit } from '../utils/rateLimit.js';
import { maskEmail } from '../utils/log.js';
import { config } from '../config.js';

const INBOX = process.env.LANDING_INBOX_EMAIL || 'mfranciscomartinez@gmail.com';

const contactRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  max: 3,
  message: 'Recibimos varias solicitudes desde tu ubicación. Espera una hora o escríbenos directo a hola@contan2.com.',
});

// Honeypot field: aceptamos cualquier string; si trae contenido, descartamos
// silenciosamente en el handler (200 OK) para que el bot crea que pasó.
const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  organization: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().email().max(255),
  message: z.string().trim().max(2000).optional().default(''),
  fax: z.string().max(200).optional().default(''),
});

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let _resend = null;
function client() {
  if (!_resend && config.RESEND_API_KEY) {
    _resend = new Resend(config.RESEND_API_KEY);
  }
  return _resend;
}

function inboxHtml({ name, organization, email, message, ip, ua }) {
  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f4f6fa;padding:24px;color:#0f172a;">
    <table style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
      <tr><td style="background:linear-gradient(135deg,#4338ca 0%,#6366f1 100%);padding:24px 28px;color:#fff;">
        <div style="font-size:11px;letter-spacing:2px;opacity:.85;font-weight:600;">NUEVO LEAD · CONTAN2.COM</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">${escapeHtml(name)} · ${escapeHtml(organization)}</div>
      </td></tr>
      <tr><td style="padding:24px 28px;">
        <table style="width:100%;font-size:14px;line-height:1.6;">
          <tr><td style="color:#64748b;width:120px;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
          <tr><td style="color:#64748b;">Organización</td><td>${escapeHtml(organization)}</td></tr>
          <tr><td style="color:#64748b;vertical-align:top;padding-top:8px;">Mensaje</td>
              <td style="padding-top:8px;white-space:pre-wrap;">${escapeHtml(message || '(sin mensaje)')}</td></tr>
        </table>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:14px 28px;font-size:11px;color:#94a3b8;border-top:1px solid #e5e7eb;">
        IP: ${escapeHtml(ip || '')} · UA: ${escapeHtml((ua || '').slice(0, 160))}
      </td></tr>
    </table>
  </body></html>`;
}

function ackHtml({ name }) {
  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f4f6fa;padding:24px;color:#0f172a;">
    <table style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
      <tr><td style="background:linear-gradient(135deg,#4338ca 0%,#6366f1 100%);padding:32px 28px;color:#fff;text-align:center;">
        <div style="font-size:11px;letter-spacing:2px;opacity:.85;font-weight:600;">CONTAN2</div>
        <div style="font-size:22px;font-weight:700;margin-top:6px;">Recibimos tu solicitud</div>
      </td></tr>
      <tr><td style="padding:28px;font-size:15px;line-height:1.6;color:#1f2937;">
        <p>Hola ${escapeHtml(name)},</p>
        <p>Gracias por escribirnos. Vimos tu interés en <strong>contan2</strong> y te
        responderemos en menos de 24 horas hábiles con una propuesta concreta y un enlace
        para agendar una demo.</p>
        <p>Mientras tanto, si quieres ver cómo lo usa el Centro Cultural Banreservas
        — nuestro cliente ancla — solo respondé a este correo y te paso credenciales
        de un tour guiado.</p>
        <p style="margin-top:24px;color:#64748b;">— Marcelino Francisco<br>contan2</p>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:14px 28px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e5e7eb;">
        Este correo lo enviamos porque llenaste el formulario en contan2.com.
      </td></tr>
    </table>
  </body></html>`;
}

export function createLandingRouter() {
  const router = Router();

  router.post('/contact', contactRateLimit, async (req, res, next) => {
    let parsed;
    try {
      parsed = contactSchema.parse(req.body || {});
    } catch (e) {
      return next(new HttpError(400, 'Datos incompletos o inválidos.'));
    }

    // Honeypot: si vino algo en `fax`, contestamos OK pero no enviamos.
    if (parsed.fax && parsed.fax.length > 0) {
      console.log('[landing] honeypot descartado, IP=%s', req.ip || '?');
      return res.json({ ok: true });
    }

    const c = client();
    const ip = req.ip || req.socket?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';

    if (!c) {
      console.log('[landing-dev] contacto de %s (%s) — falta RESEND_API_KEY',
        maskEmail(parsed.email), parsed.organization);
      return res.json({ ok: true });
    }

    // Inbox primero (lo crítico), confirmación al prospect después (best-effort).
    try {
      const result = await c.emails.send({
        from: config.EMAIL_FROM,
        to: INBOX,
        reply_to: parsed.email,
        subject: `Lead · ${parsed.organization} (${parsed.name})`,
        html: inboxHtml({ ...parsed, ip, ua }),
      });
      if (result.error) {
        console.error('[landing] error enviando lead a inbox:', result.error.message || result.error);
        // Aun así devolvemos 200 para no exponer al usuario.
      } else {
        console.log('[landing] lead recibido: %s · %s (id=%s)',
          maskEmail(parsed.email), parsed.organization, result.data?.id || '?');
      }
    } catch (e) {
      console.error('[landing] excepción al enviar lead:', e.message);
    }

    try {
      await c.emails.send({
        from: config.EMAIL_FROM,
        to: parsed.email,
        ...(config.EMAIL_REPLY_TO ? { reply_to: config.EMAIL_REPLY_TO } : {}),
        subject: 'Recibimos tu solicitud · contan2',
        html: ackHtml({ name: parsed.name }),
      });
    } catch (e) {
      // No-op: el ack es nice-to-have, no fallamos por esto.
      console.warn('[landing] no se pudo enviar ack a %s:', maskEmail(parsed.email), e.message);
    }

    return res.json({ ok: true });
  });

  return router;
}
