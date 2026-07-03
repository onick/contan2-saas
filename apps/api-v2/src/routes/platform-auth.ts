// apps/api-v2/src/routes/platform-auth.ts · login/logout/me del PLATFORM ADMIN.
//   POST /platform/auth/login  · público (rate-limit por IP), setea cookie admin.
//   POST /platform/auth/logout · revoca la sesión + limpia cookie (idempotente).
//   GET  /platform/auth/me     · requiere sesión de platform admin.
// Sin tenant: el super-admin no pertenece a ninguna organización. Cookie y tabla
// de sesión propias (contan2_admin_session / platform_sessions).

import { createHash } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb } from '@contan2/db';
import {
  PlatformLoginRequestSchema,
  PlatformChangePasswordRequestSchema,
  type PlatformLoginResponse,
  type PlatformMeResponse,
  type PlatformLogoutResponse,
  type PlatformSessionsResponse,
} from '@contan2/contracts';
import { verifyStaffPassword, hashStaffPassword } from '../services/password.js';
import { isLocked, lockedMessage, registerFailedAttempt, type LockoutState } from '../services/lockout.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { baseCookieOptions, ADMIN_SESSION_COOKIE } from '../cookies.js';
import { requirePlatformAdmin } from '../platform-guard.js';
import {
  loadPlatformAdminByEmail,
  createPlatformSession,
  revokePlatformSession,
  publicPlatformAdmin,
} from '../services/platform-session.js';

// Rate-limit: 10 intentos / 15 min por IP (paridad con el login de tenant).
const loginLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000, prefix: endpointPrefix('platform-login') });

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export const platformAuthRoute: FastifyPluginAsync = async (app) => {
  app.post('/platform/auth/login', async (req: FastifyRequest, reply) => {
    const db = getDb();

    const rl = await loginLimiter.hit(req.ip);
    if (rl.limited) {
      reply.code(429);
      reply.header('retry-after', Math.ceil(rl.retryAfterMs / 1000));
      return { error: 'Demasiados intentos. Espera unos minutos e intentá de nuevo.' };
    }

    const parsed = PlatformLoginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Email o contraseña inválidos.' };
    }
    const { email, password, rememberMe } = parsed.data;

    // 401 idéntico para "no existe" y "password incorrecta" (anti-enumeración).
    const admin = await loadPlatformAdminByEmail(db, email);
    if (!admin) {
      reply.code(401);
      return { error: 'Credenciales inválidas.' };
    }

    // Lockout por cuenta antes de verificar el password.
    const lockState: LockoutState = {
      failedAttempts: admin.failed_attempts,
      lockedUntil: admin.locked_until ? new Date(admin.locked_until) : null,
      lockLevel: admin.lock_level,
      lastAttemptAt: admin.last_attempt_at ? new Date(admin.last_attempt_at) : null,
    };
    if (isLocked(lockState)) {
      reply.code(423);
      return { error: lockedMessage(lockState) };
    }

    const ok = await verifyStaffPassword(admin.password_hash, password);
    if (!ok) {
      const next = registerFailedAttempt(lockState);
      await db.updateTable('platform_admins').set({
        failed_attempts: next.failedAttempts,
        locked_until: next.lockedUntil ? next.lockedUntil.toISOString() : null,
        lock_level: next.lockLevel,
        last_attempt_at: new Date().toISOString(),
      }).where('id', '=', admin.id).execute();
      if (next.locked) {
        reply.code(423);
        return { error: lockedMessage({ ...lockState, lockedUntil: next.lockedUntil }) };
      }
      reply.code(401);
      return { error: 'Credenciales inválidas.' };
    }

    if (admin.status !== 'active') {
      reply.code(403);
      return { error: 'Cuenta no activa.' };
    }

    // Reset de lockout + marca de último login.
    await db.updateTable('platform_admins').set({
      failed_attempts: 0, locked_until: null, lock_level: 0,
      last_attempt_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
      last_login_ip_hash: req.ip ? sha256(req.ip) : null,
    }).where('id', '=', admin.id).execute();

    const ua = req.headers['user-agent'];
    const { token, expiresAt } = await createPlatformSession(db, {
      adminId: admin.id,
      rememberMe,
      ipHash: req.ip ? sha256(req.ip) : null,
      userAgent: typeof ua === 'string' ? ua.slice(0, 256) : null,
    });
    reply.setCookie(ADMIN_SESSION_COOKIE, token, { ...baseCookieOptions(), expires: expiresAt });

    reply.code(200);
    const body: PlatformLoginResponse = {
      ok: true,
      admin: publicPlatformAdmin(admin),
      mustChangePassword: admin.must_change_password,
    };
    return body;
  });

  app.post('/platform/auth/logout', async (req: FastifyRequest, reply) => {
    const token = req.cookies?.[ADMIN_SESSION_COOKIE];
    await revokePlatformSession(getDb(), token);
    reply.clearCookie(ADMIN_SESSION_COOKIE, baseCookieOptions());
    const body: PlatformLogoutResponse = { ok: true };
    return body;
  });

  app.get('/platform/auth/me', async (req: FastifyRequest, reply) => {
    const guard = await requirePlatformAdmin(getDb(), req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const body: PlatformMeResponse = { admin: guard.ctx.admin };
    return body;
  });

  // POST /platform/auth/change-password · verifica la actual, setea la nueva.
  // La sesión actual sigue viva; el resto se puede revocar desde "sesiones".
  app.post('/platform/auth/change-password', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requirePlatformAdmin(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if ((await loginLimiter.hit(req.ip)).limited) { reply.code(429); return { error: 'Demasiados intentos. Esperá un momento.' }; }

    const parsed = PlatformChangePasswordRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: parsed.error.errors[0]?.message ?? 'Datos inválidos.' }; }
    const { currentPassword, newPassword } = parsed.data;

    const admin = await loadPlatformAdminByEmail(db, guard.ctx.admin.email);
    if (!admin || !(await verifyStaffPassword(admin.password_hash, currentPassword))) {
      reply.code(401); return { error: 'La contraseña actual es incorrecta.' };
    }
    if (newPassword === currentPassword) { reply.code(400); return { error: 'La nueva contraseña debe ser distinta.' }; }

    await db.updateTable('platform_admins')
      .set({ password_hash: await hashStaffPassword(newPassword), must_change_password: false, updated_at: new Date().toISOString() })
      .where('id', '=', admin.id).execute();
    reply.code(200); return { ok: true as const };
  });

  // GET /platform/auth/sessions · sesiones activas del admin (la actual marcada).
  app.get('/platform/auth/sessions', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requirePlatformAdmin(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const rows = await db.selectFrom('platform_sessions')
      .select(['id', 'created_at', 'user_agent'])
      .where('platform_admin_id', '=', guard.ctx.admin.id)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc').limit(50).execute();
    const body: PlatformSessionsResponse = {
      sessions: rows.map((r) => ({
        id: r.id,
        createdAt: new Date(r.created_at as unknown as string).toISOString(),
        userAgent: r.user_agent ?? null,
        current: r.id === guard.ctx.sessionId,
      })),
    };
    return body;
  });

  // DELETE /platform/auth/sessions/:id · revoca una sesión propia (incl. la actual).
  app.delete('/platform/auth/sessions/:id', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requirePlatformAdmin(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const id = (req.params as { id: string }).id;
    const res = await db.updateTable('platform_sessions')
      .set({ revoked_at: new Date().toISOString() })
      .where('id', '=', id)
      .where('platform_admin_id', '=', guard.ctx.admin.id) // solo sesiones propias
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows ?? 0n) === 0) { reply.code(404); return { error: 'Sesión no encontrada.' }; }
    reply.code(200); return { ok: true as const };
  });
};
