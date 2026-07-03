// apps/api-v2/src/platform-guard.ts · guard del PLATFORM ADMIN (super-admin
// cross-tenant). Espejo de requireTenantStaff pero SIN tenant: valida la cookie
// contan2_admin_session contra platform_sessions → platform_admins activo.
// Devuelve un resultado discriminado (no toca reply) igual que guard.ts.

import type { FastifyRequest } from 'fastify';
import type { DbClient } from '@contan2/db';
import { ADMIN_SESSION_COOKIE } from './cookies.js';
import { resolvePlatformSession, type PublicPlatformAdmin } from './services/platform-session.js';

export interface PlatformContext {
  admin: PublicPlatformAdmin;
  sessionId: string;
}

export type PlatformGuardResult =
  | { ok: true; ctx: PlatformContext }
  | { ok: false; status: number; error: string };

export async function requirePlatformAdmin(
  db: DbClient,
  req: FastifyRequest,
): Promise<PlatformGuardResult> {
  const token = req.cookies?.[ADMIN_SESSION_COOKIE];
  if (!token) {
    return { ok: false, status: 401, error: 'No autenticado' };
  }
  const resolved = await resolvePlatformSession(db, token);
  if (!resolved) {
    return { ok: false, status: 401, error: 'Sesión expirada o inválida' };
  }
  return { ok: true, ctx: resolved };
}
