// apps/api-v2/src/routes/audit.ts · Historial (log de auditoría del tenant), F5.
// GET /api/v2/org/audit?action=&actor=&targetType=&from=&to=&cursor=&limit=
//   owner/admin (read-only; el log de auditoría es supervisión admin, no operación
//   de puerta → operator 403). Tenant-scoped por la sesión. Paginación keyset.
//   Respuesta SANITIZADA: sin ip_hash ni ua. Endpoint de SOLO lectura: no audita.

import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
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
    const body: AuditOverviewResponse = await auditOverview(db, org.id);
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
    const page = await readAuditLog(db, org.id, {
      action: q.action ? String(q.action) : undefined,
      actor: q.actor ? String(q.actor).slice(0, 120) : undefined,
      targetType: q.targetType ? String(q.targetType) : undefined,
      category: q.category ? String(q.category) : undefined,
      from: q.from ? String(q.from) : undefined,
      to: q.to ? String(q.to) : undefined,
      cursor: q.cursor ? String(q.cursor) : undefined,
      limit: Number.isFinite(limitRaw) ? Math.min(limitRaw, AUDIT_PAGE_MAX) : undefined,
    });

    const body: AuditLogResponse = page;
    return body;
  });
};
