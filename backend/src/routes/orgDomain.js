import { Router } from 'express';
import { promises as dns } from 'node:dns';
import { randomBytes } from 'node:crypto';
import { HttpError } from '../middleware/errorHandler.js';
import { requireStaffSession } from '../middleware/requireStaffSession.js';
import { requireRole } from '../middleware/requireRole.js';
import { OrganizationRepository } from '../db/postgres/platform/OrganizationRepository.js';
import { initRepositories } from '../db/repositories.js';
import { invalidateTenantCache } from '../middleware/resolveTenant.js';
import { config } from '../config.js';

// Sufijo de verificación. El tenant debe crear:
//   _contan2-verify.<su-dominio> TXT "contan2-domain-verify=<token>"
// Este patrón es industria-estándar (Resend, Vercel, Cloudflare lo usan).
const VERIFY_TXT_PREFIX = '_contan2-verify.';
const VERIFY_VALUE_PREFIX = 'contan2-domain-verify=';

// Hostname RFC simplificado: labels alfanuméricos con guiones (no al inicio/fin),
// separados por puntos. Permitimos hasta 253 chars total.
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

function normalizeDomain(s) {
  return String(s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function validateDomain(domain) {
  const errors = [];
  if (!domain) return ['Dominio requerido'];
  if (!HOSTNAME_RE.test(domain)) errors.push('Formato de dominio inválido');
  const root = config.ROOT_DOMAIN.toLowerCase();
  if (domain === root) errors.push(`No puedes usar el dominio plataforma (${root})`);
  if (domain.endsWith('.' + root)) {
    errors.push(`No puedes usar un subdominio de ${root} como custom (ya tienes uno asignado por tu slug)`);
  }
  // Bloquear dominios sospechosos
  if (/localhost|127\.0\.0\.1|::1/.test(domain)) errors.push('Dominio inválido');
  return errors;
}

function generateToken() {
  return randomBytes(16).toString('hex'); // 32 chars
}

function publicView(org, { baseDomain } = {}) {
  if (!org) return null;
  return {
    customDomain: org.customDomain || null,
    verifiedAt: org.customDomainVerifiedAt || null,
    verifyToken: org.customDomainVerifyToken || null,
    instructions: org.customDomain && !org.customDomainVerifiedAt && org.customDomainVerifyToken
      ? {
          txt: {
            host: `${VERIFY_TXT_PREFIX}${org.customDomain}`,
            value: `${VERIFY_VALUE_PREFIX}${org.customDomainVerifyToken}`,
            note: 'Crea este TXT en tu DNS. Puede tardar unos minutos en propagarse.',
          },
          cname: {
            host: org.customDomain,
            value: baseDomain || config.ROOT_DOMAIN,
            note: 'Crea también este CNAME para que el tráfico llegue a nuestros servidores.',
          },
        }
      : null,
  };
}

// Tier de autorización: TODOS los endpoints → ADMIN/OWNER.
// Razón: el dominio personalizado es configuración institucional sensible
// (apunta el branding y el tráfico del tenant). Operator y scanner PIN no
// deben acceder ni modificarlo.
export function createOrgDomainRouter() {
  const router = Router();
  router.use(requireStaffSession);
  router.use(requireRole(['owner', 'admin']));

  // GET /api/org/domain — estado actual del dominio personalizado del tenant.
  router.get('/', async (req, res, next) => {
    try {
      if (!req.organization) throw new HttpError(404, 'Sin organización');
      res.json(publicView(req.organization, { baseDomain: config.ROOT_DOMAIN }));
    } catch (e) {
      next(e);
    }
  });

  // PATCH /api/org/domain — solicitar/actualizar dominio personalizado.
  // Genera un token nuevo y deja el dominio en estado "pendiente de verificación".
  router.patch('/', async (req, res, next) => {
    try {
      if (!req.organization) throw new HttpError(404, 'Sin organización');
      const domain = normalizeDomain(req.body?.domain);
      const errs = validateDomain(domain);
      if (errs.length) throw new HttpError(400, errs.join(' · '));

      if (config.DB_DRIVER !== 'postgres') {
        throw new HttpError(503, 'La gestión de dominios requiere Postgres');
      }

      const inst = await initRepositories();
      const repo = new OrganizationRepository(inst.pool);

      // ¿Otro tenant ya reclamó este dominio?
      const conflict = await repo.findByCustomDomain(domain);
      if (conflict && conflict.id !== req.organization.id) {
        throw new HttpError(409, 'Este dominio ya está reservado por otra organización');
      }

      const token = generateToken();
      const updated = await repo.update(req.organization.id, {
        customDomain: domain,
        customDomainVerifyToken: token,
        // Reseteamos verifiedAt: si cambian el dominio, hay que re-verificar.
        customDomainVerifiedAt: null,
      });

      // Invalida cache para que el lookup por dominio nuevo funcione una vez verificado.
      if (req.organization.customDomain) invalidateTenantCache(req.organization.customDomain);
      invalidateTenantCache(domain);

      console.log(`[org-domain] tenant ${updated.slug} solicitó dominio ${domain} (token=${token.slice(0, 8)}...)`);

      res.json(publicView(updated, { baseDomain: config.ROOT_DOMAIN }));
    } catch (e) {
      next(e);
    }
  });

  // POST /api/org/domain/verify — el tenant pulsa "Verificar".
  // Hacemos lookup DNS TXT. Si encuentra el token correcto -> verifiedAt = NOW().
  router.post('/verify', async (req, res, next) => {
    try {
      if (!req.organization) throw new HttpError(404, 'Sin organización');
      const org = req.organization;
      if (!org.customDomain || !org.customDomainVerifyToken) {
        throw new HttpError(400, 'No hay dominio pendiente de verificar');
      }
      if (org.customDomainVerifiedAt) {
        return res.json({ ok: true, alreadyVerified: true, ...publicView(org, { baseDomain: config.ROOT_DOMAIN }) });
      }

      const txtHost = `${VERIFY_TXT_PREFIX}${org.customDomain}`;
      const expected = `${VERIFY_VALUE_PREFIX}${org.customDomainVerifyToken}`;
      let records;
      try {
        records = await dns.resolveTxt(txtHost);
      } catch (e) {
        const reason = (e.code === 'ENOTFOUND' || e.code === 'ENODATA')
          ? `No encontramos un TXT en ${txtHost}. ¿Lo creaste? La propagación DNS puede tardar 1-30 minutos.`
          : `Error consultando DNS: ${e.message}`;
        return res.status(202).json({ ok: false, verified: false, reason, expectedTxt: txtHost, expectedValue: expected });
      }

      // resolveTxt retorna string[][] (cada TXT puede ser multi-string)
      const flat = records.map(r => Array.isArray(r) ? r.join('') : String(r));
      const found = flat.includes(expected);
      if (!found) {
        return res.status(202).json({
          ok: false,
          verified: false,
          reason: `El TXT existe pero no contiene el valor esperado. Asegúrate de poner exactamente: ${expected}`,
          expectedValue: expected,
          foundValues: flat,
        });
      }

      if (config.DB_DRIVER !== 'postgres') {
        throw new HttpError(503, 'La verificación requiere Postgres');
      }

      const inst = await initRepositories();
      const repo = new OrganizationRepository(inst.pool);
      const updated = await repo.update(org.id, {
        customDomainVerifiedAt: new Date().toISOString(),
      });
      invalidateTenantCache(updated.slug);
      invalidateTenantCache(updated.customDomain);

      console.log(`[org-domain] tenant ${updated.slug} VERIFICÓ dominio ${updated.customDomain}`);

      res.json({
        ok: true,
        verified: true,
        ...publicView(updated, { baseDomain: config.ROOT_DOMAIN }),
        nextStep: 'Tu dominio está verificado. Nuestro equipo activará el routing en unos minutos. Si pasa más de 1 hora sin estar live, contáctanos.',
      });
    } catch (e) {
      next(e);
    }
  });

  // DELETE /api/org/domain — el tenant remueve su dominio personalizado.
  router.delete('/', async (req, res, next) => {
    try {
      if (!req.organization) throw new HttpError(404, 'Sin organización');
      if (!req.organization.customDomain) {
        return res.status(204).end();
      }
      if (config.DB_DRIVER !== 'postgres') {
        throw new HttpError(503, 'Requiere Postgres');
      }
      const oldDomain = req.organization.customDomain;
      const inst = await initRepositories();
      const repo = new OrganizationRepository(inst.pool);
      await repo.update(req.organization.id, {
        customDomain: null,
        customDomainVerifyToken: null,
        customDomainVerifiedAt: null,
      });
      invalidateTenantCache(oldDomain);
      invalidateTenantCache(req.organization.slug);
      console.log(`[org-domain] tenant ${req.organization.slug} removió dominio ${oldDomain}`);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return router;
}
