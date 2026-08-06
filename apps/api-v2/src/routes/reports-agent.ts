// apps/api-v2/src/routes/reports-agent.ts · POST /reports/agent — Asistente de
// Reportes. Recibe una consulta en español, el motor de intenciones la resuelve
// y ejecuta la acción (reporte de período, comparaciones, stats de actividad).
// Solo lectura sobre datos del tenant; las descargas van por los endpoints de
// reportería existentes (auditados allá). Guard estándar + rate limit.

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, withTenant } from '@contan2/db';
import { ReportsAgentRequestSchema, type ReportsAgentResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { runAgentQuery } from '../services/reports/agent.js';

const TZ = process.env.CHECKIN_TZ ?? 'America/Santo_Domingo';
const agentLimiter = createRateLimiter({ max: 60, windowMs: 60_000, prefix: endpointPrefix('reports-agent') });

export const reportsAgentRoute: FastifyPluginAsync = async (app) => {
  app.post('/reports/agent', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    if ((await agentLimiter.hit(`${orgId}:${req.ip}`)).limited) {
      reply.code(429); return { error: 'Demasiadas consultas seguidas. Esperá un momento.' };
    }
    const parsed = ReportsAgentRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Consulta inválida.' }; }

    const todayYmd = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const body: ReportsAgentResponse = await runAgentQuery(db, orgId, parsed.data.query, todayYmd);
    return body;
    });
  });
};
