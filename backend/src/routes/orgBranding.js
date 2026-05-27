import { Router } from 'express';
import { OrganizationRepository } from '../db/postgres/platform/OrganizationRepository.js';
import { initRepositories } from '../db/repositories.js';
import { invalidateTenantCache } from '../middleware/resolveTenant.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireStaffSession } from '../middleware/requireStaffSession.js';
import { requireRole } from '../middleware/requireRole.js';
import { config } from '../config.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const SIDEBAR_STYLES = new Set(['brand', 'dark', 'light']);

// Tier de autorización (ver docs/migration-v2/05-authorization-matrix.md):
//   GET   /  → STAFF        (lectura para mostrar setup actual)
//   PATCH /  → ADMIN/OWNER  (cambia identidad del tenant)
export function createOrgBrandingRouter() {
  const router = Router();
  router.use(requireStaffSession);

  router.get('/', (req, res, next) => {
    if (!req.organization) return next(new HttpError(404, 'Sin organización'));
    const o = req.organization;
    res.json({
      name: o.name,
      logoUrl: o.logoUrl,
      emailLogoUrl: o.emailLogoUrl,
      primaryColor: o.primaryColor,
      secondaryColor: o.secondaryColor,
      sidebarStyle: o.sidebarStyle || 'brand',
    });
  });

  router.patch('/', requireRole(['owner', 'admin']), async (req, res, next) => {
    try {
      if (!req.organization) return next(new HttpError(404, 'Sin organización'));
      const partial = {};
      const errors = [];

      if ('primaryColor' in req.body) {
        const v = String(req.body.primaryColor || '').trim();
        if (!HEX_RE.test(v)) errors.push({ field: 'primaryColor', message: 'Debe ser hex #RRGGBB' });
        else partial.primaryColor = v.toLowerCase();
      }
      if ('secondaryColor' in req.body) {
        const v = String(req.body.secondaryColor || '').trim();
        if (!HEX_RE.test(v)) errors.push({ field: 'secondaryColor', message: 'Debe ser hex #RRGGBB' });
        else partial.secondaryColor = v.toLowerCase();
      }
      if ('sidebarStyle' in req.body) {
        const v = String(req.body.sidebarStyle || '').trim();
        if (!SIDEBAR_STYLES.has(v)) errors.push({ field: 'sidebarStyle', message: 'brand | dark | light' });
        else partial.sidebarStyle = v;
      }
      if ('logoUrl' in req.body) {
        const v = req.body.logoUrl;
        if (v === null || v === '') {
          partial.logoUrl = null;
        } else if (typeof v === 'string' && v.length <= 500) {
          partial.logoUrl = v.trim();
        } else {
          errors.push({ field: 'logoUrl', message: 'logoUrl inválida' });
        }
      }
      if ('emailLogoUrl' in req.body) {
        const v = req.body.emailLogoUrl;
        if (v === null || v === '') {
          partial.emailLogoUrl = null;
        } else if (typeof v === 'string' && v.length <= 500) {
          partial.emailLogoUrl = v.trim();
        } else {
          errors.push({ field: 'emailLogoUrl', message: 'emailLogoUrl inválida' });
        }
      }

      if (errors.length) throw new HttpError(400, 'Datos inválidos', errors);
      if (Object.keys(partial).length === 0) {
        return res.json({ ok: true, organization: req.organization });
      }

      if (config.DB_DRIVER !== 'postgres') {
        // En memory mode no persistimos: solo eco para que el frontend pueda
        // probar visualmente sin Postgres (no útil en producción).
        return res.json({ ok: true, organization: { ...req.organization, ...partial } });
      }

      const inst = await initRepositories();
      const repo = new OrganizationRepository(inst.pool);
      const updated = await repo.update(req.organization.id, partial);
      invalidateTenantCache(updated.slug);
      if (updated.customDomain) invalidateTenantCache(updated.customDomain);

      res.json({
        ok: true,
        organization: {
          name: updated.name,
          logoUrl: updated.logoUrl,
          emailLogoUrl: updated.emailLogoUrl,
          primaryColor: updated.primaryColor,
          secondaryColor: updated.secondaryColor,
          sidebarStyle: updated.sidebarStyle || 'brand',
        },
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
