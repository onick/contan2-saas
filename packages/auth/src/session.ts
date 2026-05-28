// packages/auth/src/session.ts
// Valida un token de sesión de staff contra staff_auth_sessions (la MISMA
// tabla que escribe v1). Read-only: no toca last_seen ni nada.

import type { Kysely } from 'kysely';
import type { Database } from '@contan2/db';
import { hashToken } from './tokens.js';

export interface ValidatedSession {
  id: string;
  staffMemberId: string;
  expiresAt: Date;
}

export async function validateStaffSession(
  db: Kysely<Database>,
  token: string | undefined | null,
): Promise<ValidatedSession | null> {
  if (!token || typeof token !== 'string') return null;

  const row = await db
    .selectFrom('staff_auth_sessions')
    .select(['id', 'staff_member_id', 'expires_at'])
    .where('token_hash', '=', hashToken(token))
    .where('revoked_at', 'is', null)
    .limit(1)
    .executeTakeFirst();

  if (!row) return null;

  const expires =
    row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
  if (expires.getTime() <= Date.now()) return null;

  return {
    id: row.id,
    staffMemberId: row.staff_member_id,
    expiresAt: expires,
  };
}
