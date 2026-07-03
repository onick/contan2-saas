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
  type PlatformLoginResponse,
  type PlatformMeResponse,
  type PlatformLogoutResponse,
} from '@contan2/contracts';
import { verifyStaffPassword } from '../services/password.js';
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
};
