// apps/api-v2/src/routes/team.ts · Mi equipo (staff_members), F5.
// GET /api/v2/org/team?q=&role=&status=&cursor=&limit=
//   owner/admin (paridad v1: la gestión de staff es admin → operator 403).
//   Tenant-scoped por la sesión. Selección segura (sin hashes ni campos internos).
//   Read-only: no audita.

import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import type { TeamListResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { readTeam, TEAM_PAGE_MAX } from '../services/team-read.js';

const CAN_VIEW_TEAM = new Set(['owner', 'admin']);

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
};
