import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import { resolveStaffSession } from '@contan2/auth';
import type { StaffMeResponse } from '@contan2/contracts';

// GET /api/v2/auth/me · valida la cookie contan2_session (la MISMA de v1) y
// devuelve el staff autenticado. Read-only: no crea ni setea cookies.
//
// Paridad con v1 (/api/auth/me):
//   sin cookie / inválida / expirada / revocada / staff no-activo → 401
//   ok → { staff, sessionId }
const SESSION_COOKIE = 'contan2_session';

export const authMeRoute: FastifyPluginAsync = async (app) => {
  app.get('/auth/me', async (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
      reply.code(401);
      return { error: 'No autenticado' };
    }

    const resolved = await resolveStaffSession(getDb(), token);
    if (!resolved) {
      reply.code(401);
      return { error: 'Sesión expirada o inválida' };
    }

    const body: StaffMeResponse = {
      staff: resolved.staff,
      sessionId: resolved.sessionId,
    };
    return body;
  });
};
