// apps/api-v2/src/services/platform-session.ts · sesiones del PLATFORM ADMIN
// (super-admin cross-tenant). Tabla propia platform_sessions, separada de
// staff_auth_sessions del tenant. Mismo esquema de token que el staff: token en
// claro (randomBytes 32 → 64 hex) para la cookie, token_hash = sha256 en DB.
// Read + write viven acá porque el platform admin es específico de api-v2 (no
// forma parte de @contan2/auth, que es tenant-scoped).

import { randomBytes } from 'node:crypto';
import type { DbClient } from '@contan2/db';
import { hashToken } from '@contan2/auth';

const TTL_MS = 12 * 60 * 60 * 1000; // 12 h
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

export interface PlatformAdminRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  status: string;
  must_change_password: boolean;
  failed_attempts: number;
  locked_until: Date | null;
  lock_level: number;
  last_attempt_at: Date | null;
  last_login_at: Date | null;
}

export interface PublicPlatformAdmin {
  id: string;
  email: string;
  fullName: string;
  status: 'active' | 'suspended' | 'deleted';
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export function publicPlatformAdmin(r: PlatformAdminRow): PublicPlatformAdmin {
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    status: r.status as PublicPlatformAdmin['status'],
    mustChangePassword: r.must_change_password,
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
  };
}

const ADMIN_COLUMNS = [
  'id', 'email', 'full_name', 'password_hash', 'status', 'must_change_password',
  'failed_attempts', 'locked_until', 'lock_level', 'last_attempt_at', 'last_login_at',
] as const;

export async function loadPlatformAdminByEmail(db: DbClient, email: string): Promise<PlatformAdminRow | null> {
  const row = await db
    .selectFrom('platform_admins')
    .select(ADMIN_COLUMNS)
    .where('email', '=', email)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  return (row as PlatformAdminRow | undefined) ?? null;
}

export interface CreatePlatformSessionInput {
  adminId: string;
  rememberMe?: boolean;
  ipHash?: string | null;
  userAgent?: string | null;
}
export interface CreatedPlatformSession {
  token: string;
  expiresAt: Date;
  sessionId: string;
}

export async function createPlatformSession(
  db: DbClient,
  input: CreatePlatformSessionInput,
  now: Date = new Date(),
): Promise<CreatedPlatformSession> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + (input.rememberMe ? REMEMBER_TTL_MS : TTL_MS));
  const row = await db
    .insertInto('platform_sessions')
    .values({
      platform_admin_id: input.adminId,
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

export interface ResolvedPlatformSession {
  admin: PublicPlatformAdmin;
  sessionId: string;
}

// Valida token → sesión viva (no revocada, no expirada) → admin activo.
export async function resolvePlatformSession(
  db: DbClient,
  token: string | undefined | null,
): Promise<ResolvedPlatformSession | null> {
  if (!token || typeof token !== 'string') return null;
  const sess = await db
    .selectFrom('platform_sessions')
    .select(['id', 'platform_admin_id', 'expires_at'])
    .where('token_hash', '=', hashToken(token))
    .where('revoked_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  if (!sess) return null;
  const exp = sess.expires_at instanceof Date ? sess.expires_at : new Date(sess.expires_at);
  if (exp.getTime() <= Date.now()) return null;

  const admin = await db
    .selectFrom('platform_admins')
    .select(ADMIN_COLUMNS)
    .where('id', '=', sess.platform_admin_id)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  if (!admin || (admin as PlatformAdminRow).status !== 'active') return null;

  return { admin: publicPlatformAdmin(admin as PlatformAdminRow), sessionId: sess.id };
}

export async function revokePlatformSession(
  db: DbClient,
  token: string | undefined | null,
  now: Date = new Date(),
): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  const res = await db
    .updateTable('platform_sessions')
    .set({ revoked_at: now.toISOString() })
    .where('token_hash', '=', hashToken(token))
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  return Number(res.numUpdatedRows ?? 0n) > 0;
}
