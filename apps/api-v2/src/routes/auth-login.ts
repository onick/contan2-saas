// apps/api-v2/src/routes/auth-login.ts · ESCRITURA. Login/logout del admin v2.
// Paridad con v1 (backend/src/routes/auth.js):
//   POST /api/v2/auth/login  · tenant por host, busca staff por (org,email),
//     verifica Argon2, crea sesión en staff_auth_sessions, setea la cookie
//     contan2_session (la MISMA de v1, byte-compatible).
//   POST /api/v2/auth/logout · revoca la sesión por cookie + limpia la cookie.
//
// El tenant SIEMPRE sale del host (nunca del body). Rate-limit por IP real
// (trustProxy=1 → req.ip). owner/admin/operator pueden ingresar; los permisos
// de escritura se gatean por endpoint (p. ej. activities exige owner/admin).
//
// NOTA de alcance: el lockout por CUENTA de v1 (423, failed_attempts/locked_until)
// NO se porta acá — requeriría ESCRIBIR en staff_members, fuera del alcance de
// este PR (sólo se escribe staff_auth_sessions). El rate-limit por IP cubre la
// fuerza bruta a nivel de este PR.

import { createHash } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb } from '@contan2/db';
import {
  loadStaffForLogin,
  publicStaff,
  createStaffSession,
  revokeStaffSession,
} from '@contan2/auth';
import {
  StaffLoginRequestSchema,
  type StaffLoginResponse,
  type StaffLogoutResponse,
} from '@contan2/contracts';
import { resolveTenantFromHost, effectiveHost } from '../tenant.js';
import { verifyStaffPassword } from '../services/password.js';
import { createRateLimiter } from '../rate-limit.js';

const SESSION_COOKIE = 'contan2_session';

// Rate-limit de login: 10 intentos / 15 min por IP (paridad con v1 · auth.js:31).
// Backend según REDIS_URL: Redis (compartido) si está seteado, in-memory si no.
const loginLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000, prefix: 'login' });

// secure=true sólo en prod (en prod NODE_ENV=production, ver Dockerfile). En
// dev/tests (http) iría false para que la cookie funcione sin TLS. Mismo criterio
// efectivo que v1 (secure cuando no es localhost).
function isSecureCookieEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export const authLoginRoute: FastifyPluginAsync = async (app) => {
  app.post('/auth/login', async (req: FastifyRequest, reply) => {
    const db = getDb();

    // 1) Tenant por host (antes que nada, igual que v1).
    const tenant = await resolveTenantFromHost(db, effectiveHost(req));
    if (!tenant.ok) {
      if (tenant.reason === 'suspended') {
        reply.code(503);
        return { error: 'Organización suspendida' };
      }
      reply.code(404);
      return { error: 'Organización no encontrada' };
    }

    // 2) Rate-limit por IP real (req.ip viene de trustProxy=1).
    const rl = await loginLimiter.hit(req.ip);
    if (rl.limited) {
      reply.code(429);
      reply.header('retry-after', Math.ceil(rl.retryAfterMs / 1000));
      return { error: 'Demasiados intentos. Espera unos minutos e intentá de nuevo.' };
    }

    // 3) Body válido.
    const parsed = StaffLoginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Email o contraseña inválidos.' };
    }
    const { email, password, rememberMe } = parsed.data;

    // 4) Staff por (org, email). 401 idéntico para "no existe" y "password
    //    incorrecta" (anti-enumeración, igual que v1).
    const staff = await loadStaffForLogin(db, tenant.org.id, email);
    if (!staff) {
      reply.code(401);
      return { error: 'Credenciales inválidas.' };
    }

    const ok = await verifyStaffPassword(staff.password_hash, password);
    if (!ok) {
      reply.code(401);
      return { error: 'Credenciales inválidas.' };
    }

    // 5) Password correcta pero cuenta no activa → 403 (paridad con v1).
    if (staff.status !== 'active') {
      reply.code(403);
      return { error: 'Cuenta no activa.' };
    }

    // 6) Crear sesión byte-compatible + setear cookie.
    const ua = req.headers['user-agent'];
    const { token, expiresAt } = await createStaffSession(db, {
      staffMemberId: staff.id,
      rememberMe,
      ipHash: req.ip ? sha256(req.ip) : null,
      userAgent: typeof ua === 'string' ? ua.slice(0, 256) : null,
    });

    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isSecureCookieEnv(),
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    reply.code(200);
    const body: StaffLoginResponse = {
      ok: true,
      staff: publicStaff(staff),
      mustChangePassword: staff.must_change_password,
    };
    return body;
  });

  // Logout: idempotente. Revoca la sesión de la cookie (si la hay) y limpia la
  // cookie del navegador. No requiere que la sesión sea válida.
  app.post('/auth/logout', async (req: FastifyRequest, reply) => {
    const token = req.cookies?.[SESSION_COOKIE];
    await revokeStaffSession(getDb(), token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    const body: StaffLogoutResponse = { ok: true };
    return body;
  });
};
