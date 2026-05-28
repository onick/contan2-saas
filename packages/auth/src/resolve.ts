// packages/auth/src/resolve.ts
// Orquesta sesión + staff en una sola llamada: la que usa GET /api/v2/auth/me.

import type { Kysely } from 'kysely';
import type { Database } from '@contan2/db';
import { validateStaffSession } from './session.js';
import { loadActiveStaffById, publicStaff, type PublicStaff } from './staff.js';

export interface ResolvedStaffSession {
  staff: PublicStaff;
  sessionId: string;
}

export interface ResolveOpts {
  // Preparación cross-tenant: si se pasa y la sesión es de otra org, se
  // rechaza. api-v2 todavía NO resuelve tenant por subdominio, así que en
  // PR #3 no se pasa. v1 distingue 403 (cross-tenant) de 401 (inválida);
  // cuando api-v2 active tenant resolution, este resolver debería devolver
  // un resultado discriminado para preservar ese 403. Por ahora null.
  organizationId?: string;
}

export async function resolveStaffSession(
  db: Kysely<Database>,
  token: string | undefined | null,
  opts: ResolveOpts = {},
): Promise<ResolvedStaffSession | null> {
  const session = await validateStaffSession(db, token);
  if (!session) return null;

  const staffRow = await loadActiveStaffById(db, session.staffMemberId);
  if (!staffRow) return null;

  if (opts.organizationId && staffRow.organization_id !== opts.organizationId) {
    return null;
  }

  return { staff: publicStaff(staffRow), sessionId: session.id };
}
