// packages/auth/src/session-write.ts
// ESCRITURA de sesiones de staff en staff_auth_sessions — la MISMA tabla que
// escribe v1 (backend/src/services/auth/sessionService.js). DEBE ser
// byte-compatible: token = randomBytes(32).hex (64 chars), token_hash =
// sha256(token), TTL 12h normal / 30d remember-me. Una sesión creada acá valida
// con validateStaffSession (este paquete) Y con v1, y viceversa.
//
// Es la ÚNICA superficie de @contan2/auth que ESCRIBE. El resto es read-only.

import { randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@contan2/db';
import { hashToken } from './tokens.js';

// TTLs idénticos a v1 (sessionService.js:17-18).
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h
export const SESSION_REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

export interface CreateSessionInput {
  staffMemberId: string;
  rememberMe?: boolean;
  ipHash?: string | null; // sha256(ip) — el caller decide; NUNCA IP en claro
  userAgent?: string | null; // el caller trunca
}

export interface CreatedStaffSession {
  token: string; // valor en claro para la cookie (NUNCA se persiste así)
  expiresAt: Date;
  sessionId: string;
}

// Crea una sesión y devuelve el token en claro (para la cookie). `now` es
// inyectable para tests deterministas de TTL/expiración.
export async function createStaffSession(
  db: Kysely<Database>,
  input: CreateSessionInput,
  now: Date = new Date(),
): Promise<CreatedStaffSession> {
  const token = randomBytes(32).toString('hex'); // 64 hex chars (= v1)
  const ttl = input.rememberMe ? SESSION_REMEMBER_TTL_MS : SESSION_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttl);
  const row = await db
    .insertInto('staff_auth_sessions')
    .values({
      staff_member_id: input.staffMemberId,
      token_hash: hashToken(token),
      expires_at: expiresAt.toISOString(),
      remember_me: !!input.rememberMe,
      ip_hash: input.ipHash ?? null,
      user_agent: input.userAgent ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { token, expiresAt, sessionId: row.id };
}

// Revoca por token (logout). Idempotente: setea revoked_at=now sólo en filas
// aún vivas (revoked_at IS NULL). Igual que v1 (revoca, NO borra). Devuelve true
// si revocó una fila, false si el token no existía o ya estaba revocado.
export async function revokeStaffSession(
  db: Kysely<Database>,
  token: string | undefined | null,
  now: Date = new Date(),
): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  const res = await db
    .updateTable('staff_auth_sessions')
    .set({ revoked_at: now.toISOString() })
    .where('token_hash', '=', hashToken(token))
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  return Number(res.numUpdatedRows ?? 0n) > 0;
}
