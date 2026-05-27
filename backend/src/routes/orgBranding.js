import { Router } from 'express';
import { OrganizationRepository } from '../db/postgres/platform/OrganizationRepository.js';
import { initRepositories } from '../db/repositories.js';
import { invalidateTenantCache } from '../middleware/resolveTenant.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireStaffSession } from '../middleware/requireStaffSession.js';
import { requireRole } from '../middleware/requireRole.js';
import { recordAudit } from '../services/auth/auditService.js';
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

      // Fase 1 — Validar y normalizar el payload (sin tocar DB todavía).
      const proposed = {};
      const errors = [];

      if ('primaryColor' in req.body) {
        const v = String(req.body.primaryColor || '').trim();
        if (!HEX_RE.test(v)) errors.push({ field: 'primaryColor', message: 'Debe ser hex #RRGGBB' });
        else proposed.primaryColor = v.toLowerCase();
      }
      if ('secondaryColor' in req.body) {
        const v = String(req.body.secondaryColor || '').trim();
        if (!HEX_RE.test(v)) errors.push({ field: 'secondaryColor', message: 'Debe ser hex #RRGGBB' });
        else proposed.secondaryColor = v.toLowerCase();
      }
      if ('sidebarStyle' in req.body) {
        const v = String(req.body.sidebarStyle || '').trim();
        if (!SIDEBAR_STYLES.has(v)) errors.push({ field: 'sidebarStyle', message: 'brand | dark | light' });
        else proposed.sidebarStyle = v;
      }
      if ('logoUrl' in req.body) {
        const v = req.body.logoUrl;
        if (v === null || v === '') {
          proposed.logoUrl = null;
        } else if (typeof v === 'string' && v.length <= 500) {
          proposed.logoUrl = v.trim();
        } else {
          errors.push({ field: 'logoUrl', message: 'logoUrl inválida' });
        }
      }
      if ('emailLogoUrl' in req.body) {
        const v = req.body.emailLogoUrl;
        if (v === null || v === '') {
          proposed.emailLogoUrl = null;
        } else if (typeof v === 'string' && v.length <= 500) {
          proposed.emailLogoUrl = v.trim();
        } else {
          errors.push({ field: 'emailLogoUrl', message: 'emailLogoUrl inválida' });
        }
      }

      if (errors.length) throw new HttpError(400, 'Datos inválidos', errors);

      // Fase 2 — Calcular el diff REAL contra el estado actual.
      // Solo se persiste y audita lo que efectivamente cambia. Un PATCH
      // con valores idénticos a los actuales sale como no-op SIN tocar DB
      // ni audit. Esto evita inflar el audit log con eventos sin contenido
      // material (y evita un INSERT en tenant_audit_log sin justificación).
      const current = {
        logoUrl: req.organization.logoUrl ?? null,
        emailLogoUrl: req.organization.emailLogoUrl ?? null,
        primaryColor: req.organization.primaryColor ?? null,
        secondaryColor: req.organization.secondaryColor ?? null,
        sidebarStyle: req.organization.sidebarStyle ?? null,
      };
      const partial = {};
      for (const [k, v] of Object.entries(proposed)) {
        const before = current[k] ?? null;
        const after = v ?? null;
        if (before !== after) partial[k] = v;
      }

      if (Object.keys(partial).length === 0) {
        // No-op: el cliente envió valores idénticos a los actuales.
        return res.json({ ok: true, organization: req.organization, noop: true });
      }

      if (config.DB_DRIVER !== 'postgres') {
        // En memory mode no persistimos: solo eco para que el frontend pueda
        // probar visualmente sin Postgres (no útil en producción). No hay
        // audit porque no hay DB donde escribirlo.
        return res.json({ ok: true, organization: { ...req.organization, ...partial } });
      }

      // Fase 3 — UPDATE en DB. Si falla, el error sube por next() y el
      // cliente recibe 5xx. Sin UPDATE no se intenta audit.
      const inst = await initRepositories();
      const repo = new OrganizationRepository(inst.pool);
      const updated = await repo.update(req.organization.id, partial);
      invalidateTenantCache(updated.slug);
      if (updated.customDomain) invalidateTenantCache(updated.customDomain);

      // Fase 4 — Audit log en modo STRICT. Si recordAudit lanza, el
      // handler lo propaga al errorHandler y responde 5xx. NO devolvemos
      // 200 con ok:true a menos que el audit haya quedado escrito.
      //
      // Trade-off documentado: si la auditoría falla DESPUÉS del UPDATE,
      // la DB queda con el nuevo branding pero sin entrada en
      // tenant_audit_log. El cliente ve 5xx; el operador debe inspeccionar
      // manualmente el estado de la fila (vía SELECT) y decidir si:
      //   a) re-emitir el PATCH para forzar el camino feliz (idempotente:
      //      la fase 2 detecta valores idénticos y sale como no-op);
      //   b) registrar la auditoría manualmente con evidencia operacional.
      // Esto es preferible a "tragarse" el fallo de audit y reportar
      // ok:true al cliente — un cambio de identidad institucional sin
      // audit log es violatorio del contrato.
      const changed = Object.keys(partial);
      const diff = {};
      for (const k of changed) {
        diff[k] = { from: current[k] ?? null, to: updated[k] ?? null };
      }
      await recordAudit({
        req,
        action: 'branding.updated',
        targetType: 'organization',
        targetId: updated.id,
        targetLabel: updated.slug,
        metadata: { fields: changed, diff },
        strict: true,
      });

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
