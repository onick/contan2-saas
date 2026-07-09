// apps/api-v2/src/routes/audit.ts · Historial (log de auditoría del tenant), F5.
// GET /api/v2/org/audit?action=&actor=&targetType=&from=&to=&cursor=&limit=
//   owner/admin (read-only; el log de auditoría es supervisión admin, no operación
//   de puerta → operator 403). Tenant-scoped por la sesión. Paginación keyset.
//   Respuesta SANITIZADA: sin ip_hash ni ua. Endpoint de SOLO lectura: no audita.

import type { FastifyPluginAsync } from 'fastify';
import { getDb, withTenant } from '@contan2/db';
import type { AuditLogResponse, AuditOverviewResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { readAuditLog, AUDIT_PAGE_MAX } from '../services/audit-read.js';
import { auditOverview } from '../services/audit-overview.js';

const CAN_READ_AUDIT = new Set(['owner', 'admin']);

export const auditRoute: FastifyPluginAsync = async (app) => {
  // Overview del dashboard: KPIs + donut + top actores + sospechosa. Read-only,
  // owner/admin (misma allowlist que el historial).
  app.get('/org/audit/overview', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const { org, staff } = guard.ctx;
    if (!CAN_READ_AUDIT.has(staff.role)) { reply.code(403); return { error: 'No tenés permiso para ver el historial.' }; }
    // tenant_audit_log tiene RLS: sin el GUC de org (withTenant), app_v2 hace
    // default-deny → 0 filas. Envolvemos la lectura para que las policies filtren
    // por la org de la sesión (mismo patrón que el resto de rutas tenant).
    const body: AuditOverviewResponse = await withTenant(db, org.id, (trx) => auditOverview(trx, org.id));
    return body;
  });

  app.get('/org/audit', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const { org, staff } = guard.ctx;
    if (!CAN_READ_AUDIT.has(staff.role)) {
      reply.code(403);
      return { error: 'No tenés permiso para ver el historial.' };
    }

    const q = req.query as Record<string, unknown>;
    const limitRaw = Number(q.limit);
    // tenant_audit_log tiene RLS: la lectura DEBE ir dentro de withTenant para que
    // app_v2 vea las filas de la org (sin el GUC → default-deny → 0 filas).
    const page = await withTenant(db, org.id, (trx) => readAuditLog(trx, org.id, {
      action: q.action ? String(q.action) : undefined,
      actor: q.actor ? String(q.actor).slice(0, 120) : undefined,
      targetType: q.targetType ? String(q.targetType) : undefined,
      category: q.category ? String(q.category) : undefined,
      from: q.from ? String(q.from) : undefined,
      to: q.to ? String(q.to) : undefined,
      cursor: q.cursor ? String(q.cursor) : undefined,
      limit: Number.isFinite(limitRaw) ? Math.min(limitRaw, AUDIT_PAGE_MAX) : undefined,
    }));

    const body: AuditLogResponse = page;
    return body;
  });
};
