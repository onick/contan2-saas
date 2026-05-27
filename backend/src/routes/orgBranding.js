import { createHash } from 'node:crypto';
import { Router } from 'express';
import { OrganizationRepository } from '../db/postgres/platform/OrganizationRepository.js';
import { AuditLogRepository } from '../db/postgres/platform/AuditLogRepository.js';
import { initRepositories } from '../db/repositories.js';
import { invalidateTenantCache } from '../middleware/resolveTenant.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireStaffSession } from '../middleware/requireStaffSession.js';
import { requireRole } from '../middleware/requireRole.js';
import { maskEmail } from '../utils/log.js';
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

      // Fase 3 — UPDATE + INSERT audit dentro de una transacción única.
      //
      // Antes: UPDATE → audit (strict). Si audit fallaba, la DB ya había
      // cambiado y quedaba sin entrada en tenant_audit_log. Re-emitir el
      // PATCH no resolvía: la fase 2 lo detectaría como noop y nunca
      // recrearía el audit faltante.
      //
      // Ahora: BEGIN → UPDATE organizations RETURNING * → INSERT
      // tenant_audit_log → COMMIT. Si CUALQUIER paso falla (UPDATE,
      // INSERT, o la red entre ambos), ROLLBACK deshace todo y la
      // organización queda exactamente como estaba. El cliente recibe
      // 5xx y puede reintentar idempotentemente.
      const inst = await initRepositories();
      const orgRepo = new OrganizationRepository(inst.pool);
      const auditRepo = new AuditLogRepository(inst.pool);

      const changed = Object.keys(partial);

      const client = await inst.pool.connect();
      let updated;
      try {
        await client.query('BEGIN');

        // UPDATE compartiendo la conexión transaccional.
        updated = await orgRepo.update(req.organization.id, partial, client);
        if (!updated) {
          throw new Error('orgRepo.update no devolvió fila (id no encontrado o deleted_at)');
        }

        // Diff calculado con el RETURNING para reflejar el estado final
        // efectivamente persistido (no el proposed previo al cast).
        const diff = {};
        for (const k of changed) {
          diff[k] = { from: current[k] ?? null, to: updated[k] ?? null };
        }

        // INSERT audit en la MISMA transacción. Si lanza (constraint,
        // network, FK), el catch hace ROLLBACK y el UPDATE no commit-ea.
        const actorStaff = req.currentStaff || null;
        const ip = req.ip || req.socket?.remoteAddress || null;
        const ua = req.headers?.['user-agent'] || null;
        const auditRow = await auditRepo.record({
          organizationId: updated.id,
          actorStaffId: actorStaff?.id || null,
          actorEmailMasked: actorStaff?.email ? maskEmail(actorStaff.email) : null,
          actorRole: actorStaff?.role || null,
          action: 'branding.updated',
          targetType: 'organization',
          targetId: updated.id,
          targetLabel: updated.slug,
          metadata: { fields: changed, diff },
          ipHash: ip ? createHash('sha256').update(String(ip)).digest('hex') : null,
          ua,
        }, client);
        if (!auditRow) {
          throw new Error('auditRepo.record devolvió falsy dentro de transacción');
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }

      // Invalidación de cache SOLO después de COMMIT exitoso. Si la
      // transacción hubiera fallado, el cache sigue apuntando al estado
      // viejo, que sigue siendo el estado real en DB → no hay drift.
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
