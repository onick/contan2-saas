// apps/api-v2/src/guard.ts · guard tenant+staff reutilizable para endpoints
// autenticados. Extrae el patrón ya probado en org-branding.ts (tenant antes
// que auth, cross-tenant 403). Devuelve un resultado discriminado en vez de
// tocar `reply`, para que cada ruta arme su body de error.

import type { FastifyRequest } from 'fastify';
import type { DbClient, TenantOrg } from '@contan2/db';
import { resolveStaffSession } from '@contan2/auth';
import type { PublicStaff } from '@contan2/contracts';
import { resolveTenantFromHost, effectiveHost } from './tenant.js';

const SESSION_COOKIE = 'contan2_session';

export interface TenantStaffContext {
  org: TenantOrg;
  staff: PublicStaff;
  sessionId: string;
}

export type GuardResult =
  | { ok: true; ctx: TenantStaffContext }
  | { ok: false; status: number; error: string };

// Orden de checks (igual que v1: tenant antes que auth):
//   host no-tenant / inexistente → 404 (suspended → 503)
//   sin cookie / inválida        → 401
//   staff de otra org            → 403
export async function requireTenantStaff(
  db: DbClient,
  req: FastifyRequest,
  options?: { allowTrialEnded?: boolean }
): Promise<GuardResult> {
  const tenant = await resolveTenantFromHost(db, effectiveHost(req));
  if (!tenant.ok) {
    if (tenant.reason === 'suspended') {
      return { ok: false, status: 503, error: 'Organización suspendida' };
    }
    return { ok: false, status: 404, error: 'Organización no encontrada' };
  }

  if (tenant.org.status === 'trial_ended' && !options?.allowTrialEnded) {
    return { ok: false, status: 402, error: 'Período de prueba terminado' };
  }

  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    return { ok: false, status: 401, error: 'No autenticado' };
  }
  const resolved = await resolveStaffSession(db, token);
  if (!resolved) {
    return { ok: false, status: 401, error: 'Sesión expirada o inválida' };
  }
  if (resolved.staff.organizationId !== tenant.org.id) {
    return { ok: false, status: 403, error: 'Sesión de otra organización' };
  }

  return { ok: true, ctx: { org: tenant.org, staff: resolved.staff, sessionId: resolved.sessionId } };
}
