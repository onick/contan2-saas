// apps/api-v2/src/routes/team.ts · Mi equipo (staff_members), F5.
// GET /api/v2/org/team?q=&role=&status=&cursor=&limit=
//   owner/admin (paridad v1: la gestión de staff es admin → operator 403).
//   Tenant-scoped por la sesión. Selección segura (sin hashes ni campos internos).
//   Read-only: no audita.

import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import type { TeamListResponse } from '@contan2/contracts';
import { TeamRoleUpdateRequestSchema, TeamStatusUpdateRequestSchema } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { readTeam, TEAM_PAGE_MAX } from '../services/team-read.js';
import { changeRole, changeStatus, TeamWriteError } from '../services/team-write.js';

const CAN_VIEW_TEAM = new Set(['owner', 'admin']);
const CAN_MANAGE_TEAM = new Set(['owner', 'admin']);

// 20 escrituras/min por org+IP (auditoría 2026-06-10: faltaba limiter).
const writeLimiter = createRateLimiter({ max: 20, windowMs: 60_000, prefix: endpointPrefix('team-write') });

export const teamRoute: FastifyPluginAsync = async (app) => {
  app.get('/org/team', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const { org, staff } = guard.ctx;
    if (!CAN_VIEW_TEAM.has(staff.role)) {
      reply.code(403);
      return { error: 'No tenés permiso para ver el equipo.' };
    }

    const q = req.query as Record<string, unknown>;
    const limitRaw = Number(q.limit);
    const page = await readTeam(db, org.id, {
      q: q.q ? String(q.q).slice(0, 120) : undefined,
      role: q.role ? String(q.role) : undefined,
      status: q.status ? String(q.status) : undefined,
      cursor: q.cursor ? String(q.cursor) : undefined,
      limit: Number.isFinite(limitRaw) ? Math.min(limitRaw, TEAM_PAGE_MAX) : undefined,
    });

    const body: TeamListResponse = page;
    return body;
  });

  // PATCH /org/team/:id/role · cambia el rol (invariantes RBAC en team-write).
  app.patch('/org/team/:id/role', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const { org, staff } = guard.ctx;
    if (!CAN_MANAGE_TEAM.has(staff.role)) { reply.code(403); return { error: 'No tenés permiso para gestionar el equipo.' }; }
    if ((await writeLimiter.hit(`${org.id}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiadas operaciones seguidas. Espera un momento.' }; }
    const parsed = TeamRoleUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Rol inválido.' }; }
    try {
      const r = await changeRole(
        { db, orgId: org.id, actor: { id: staff.id, email: staff.email, role: staff.role }, ip: req.ip, ua: req.headers['user-agent'] ?? null },
        (req.params as { id: string }).id,
        parsed.data.role,
      );
      return r;
    } catch (e) {
      if (e instanceof TeamWriteError) { reply.code(e.status); return { error: e.message }; }
      throw e;
    }
  });

  // PATCH /org/team/:id/status · activar/suspender (revoca sesiones al suspender).
  app.patch('/org/team/:id/status', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const { org, staff } = guard.ctx;
    if (!CAN_MANAGE_TEAM.has(staff.role)) { reply.code(403); return { error: 'No tenés permiso para gestionar el equipo.' }; }
    if ((await writeLimiter.hit(`${org.id}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiadas operaciones seguidas. Espera un momento.' }; }
    const parsed = TeamStatusUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Estado inválido.' }; }
    try {
      const r = await changeStatus(
        { db, orgId: org.id, actor: { id: staff.id, email: staff.email, role: staff.role }, ip: req.ip, ua: req.headers['user-agent'] ?? null },
        (req.params as { id: string }).id,
        parsed.data.status,
      );
      return r;
    } catch (e) {
      if (e instanceof TeamWriteError) { reply.code(e.status); return { error: e.message }; }
      throw e;
    }
  });
};
