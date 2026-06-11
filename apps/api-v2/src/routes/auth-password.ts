// apps/api-v2/src/routes/auth-password.ts · S1 auth completo (paridad v1
// backend/src/routes/auth.js + tenantAuthService):
//   POST   /auth/forgot-password · público (tenant por host) · SIN LEAK: siempre
//          200 aunque el email no exista; crea token one-shot (TTL 1 h) en
//          staff_password_resets y "envía" el link (dry-run sin RESEND_API_KEY:
//          se loguea enmascarado, jamás el token).
//   POST   /auth/reset-password · público · valida fortaleza + token vigente no
//          usado → re-hashea (argon2id params v1) + marca usado + revoca TODAS
//          las sesiones del staff (fuerza re-login).
//   POST   /auth/change-password · autenticado · verifica la actual + fortaleza
//          → re-hashea + revoca las DEMÁS sesiones (la actual sigue viva).
//   GET    /auth/sessions · autenticado · sesiones activas propias.
//   DELETE /auth/sessions/:id · autenticado · revoca OTRA sesión propia (la
//          actual se cierra con /logout, paridad v1 → 400).

import { createHash, randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import {
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
  ChangePasswordRequestSchema,
  type StaffSessionsResponse,
} from '@contan2/contracts';
import { resolveTenantFromHost, effectiveHost } from '../tenant.js';
import { requireTenantStaff } from '../guard.js';
import { verifyStaffPassword, hashStaffPassword } from '../services/password.js';
import { validatePasswordStrength } from '../services/password-policy.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 h (paridad v1)

// 5 solicitudes / 15 min por IP (forgot + reset comparten bucket, paridad v1).
const forgotLimiter = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000, prefix: endpointPrefix('forgot-password') });

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
const maskEmail = (email: string): string => {
  const at = email.indexOf('@');
  return at <= 0 ? '***' : `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
};

export const authPasswordRoute: FastifyPluginAsync = async (app) => {
  app.post('/auth/forgot-password', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const tenant = await resolveTenantFromHost(db, effectiveHost(req));
    if (!tenant.ok) {
      reply.code(tenant.reason === 'suspended' ? 503 : 404);
      return { error: tenant.reason === 'suspended' ? 'Organización suspendida' : 'Organización no encontrada' };
    }
    if ((await forgotLimiter.hit(req.ip)).limited) {
      reply.code(429);
      return { error: 'Demasiados intentos. Espera unos minutos.' };
    }
    const parsed = ForgotPasswordRequestSchema.safeParse(req.body);
    // Anti-enumeración: respuesta IDÉNTICA exista o no la cuenta (y ante body
    // inválido, también 200 — un atacante no aprende nada del shape).
    const okBody = { ok: true, message: 'Si la cuenta existe, vas a recibir un correo con instrucciones.' };
    if (!parsed.success) return okBody;

    const staff = await db
      .selectFrom('staff_members')
      .select(['id', 'email', 'status'])
      .where('organization_id', '=', tenant.org.id)
      .where('email', '=', parsed.data.email)
      .executeTakeFirst();
    if (!staff || staff.status !== 'active') {
      req.log.info({ email: maskEmail(parsed.data.email), org: tenant.org.slug }, 'forgot-password sin match');
      return okBody;
    }

    const plain = randomBytes(32).toString('hex');
    const ua = req.headers['user-agent'];
    await db.insertInto('staff_password_resets').values({
      staff_member_id: staff.id,
      token_hash: hashToken(plain),
      expires_at: new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString(),
      requested_ip_hash: req.ip ? sha256(req.ip) : null,
      requested_user_agent: typeof ua === 'string' ? ua.slice(0, 256) : null,
    }).execute();

    // Entrega del link: dry-run sin RESEND_API_KEY (igual que credenciales).
    // El link apunta al host del tenant; el token JAMÁS se loguea.
    const resetUrl = `https://${effectiveHost(req)}/reset/${plain}`;
    if (process.env.RESEND_API_KEY) {
      // TODO RESEND gating: plantilla branded (Sprint C de branding). Por ahora
      // ningún entorno tiene la key seteada → siempre dry-run.
      req.log.warn('RESEND_API_KEY seteado pero la plantilla de reset aún no está cableada (dry-run)');
    }
    req.log.info({ email: maskEmail(staff.email), org: tenant.org.slug, urlLen: resetUrl.length }, 'reset link generado (dry-run)');

    return okBody;
  });

  app.post('/auth/reset-password', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const tenant = await resolveTenantFromHost(db, effectiveHost(req));
    if (!tenant.ok) {
      reply.code(tenant.reason === 'suspended' ? 503 : 404);
      return { error: tenant.reason === 'suspended' ? 'Organización suspendida' : 'Organización no encontrada' };
    }
    if ((await forgotLimiter.hit(req.ip)).limited) {
      reply.code(429);
      return { error: 'Demasiados intentos. Espera unos minutos.' };
    }
    const parsed = ResetPasswordRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Datos inválidos.' };
    }
    const strength = validatePasswordStrength(parsed.data.newPassword);
    if (strength.length > 0) {
      reply.code(400);
      return { error: `Password débil: ${strength.join(', ')}` };
    }

    const row = await db
      .selectFrom('staff_password_resets as r')
      .innerJoin('staff_members as s', 's.id', 'r.staff_member_id')
      .select(['r.id as reset_id', 's.id as staff_id', 's.status', 's.organization_id'])
      .where('r.token_hash', '=', hashToken(parsed.data.token))
      .where('r.used_at', 'is', null)
      .where('r.expires_at', '>', sql<Date>`now()`)
      .executeTakeFirst();
    // Token de otro tenant → mismo error genérico (no filtra existencia).
    if (!row || row.status !== 'active' || row.organization_id !== tenant.org.id) {
      reply.code(400);
      return { error: 'Token inválido o expirado. Solicitá un nuevo enlace.' };
    }

    const newHash = await hashStaffPassword(parsed.data.newPassword);
    await db.transaction().execute(async (tx) => {
      await tx.updateTable('staff_members')
        .set({ password_hash: newHash, must_change_password: false, failed_attempts: 0, locked_until: null, lock_level: 0 })
        .where('id', '=', row.staff_id).execute();
      await tx.updateTable('staff_password_resets').set({ used_at: sql<string>`now()` })
        .where('id', '=', row.reset_id).execute();
      // Revoca TODAS las sesiones (revoked_at, paridad v1: la fila se conserva
      // para auditoría): re-login obligatorio en todos lados.
      await tx.updateTable('staff_auth_sessions').set({ revoked_at: sql<string>`now()` })
        .where('staff_member_id', '=', row.staff_id).where('revoked_at', 'is', null).execute();
    });

    return { ok: true, message: 'Contraseña actualizada. Iniciá sesión con la nueva.' };
  });

  app.post('/auth/change-password', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const parsed = ChangePasswordRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Datos inválidos.' };
    }
    const strength = validatePasswordStrength(parsed.data.newPassword);
    if (strength.length > 0) {
      reply.code(400);
      return { error: `Password débil: ${strength.join(', ')}` };
    }

    const me = await db.selectFrom('staff_members')
      .select(['id', 'password_hash'])
      .where('id', '=', guard.ctx.staff.id)
      .executeTakeFirstOrThrow();
    if (!(await verifyStaffPassword(me.password_hash, parsed.data.currentPassword))) {
      reply.code(401);
      return { error: 'La contraseña actual no es correcta.' };
    }

    const newHash = await hashStaffPassword(parsed.data.newPassword);
    await db.transaction().execute(async (tx) => {
      await tx.updateTable('staff_members')
        .set({ password_hash: newHash, must_change_password: false })
        .where('id', '=', me.id).execute();
      // Revoca las DEMÁS sesiones; la actual sigue viva (paridad v1).
      await tx.updateTable('staff_auth_sessions').set({ revoked_at: sql<string>`now()` })
        .where('staff_member_id', '=', me.id)
        .where('id', '!=', guard.ctx.sessionId)
        .where('revoked_at', 'is', null)
        .execute();
    });

    return { ok: true, message: 'Contraseña actualizada.' };
  });

  app.get('/auth/sessions', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const rows = await db.selectFrom('staff_auth_sessions')
      .select(['id', 'remember_me', 'created_at', 'expires_at', 'user_agent'])
      .where('staff_member_id', '=', guard.ctx.staff.id)
      .where('expires_at', '>', sql<Date>`now()`)
      .where('revoked_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();
    const body: StaffSessionsResponse = {
      sessions: rows.map((s) => ({
        id: s.id,
        current: s.id === guard.ctx.sessionId,
        rememberMe: s.remember_me,
        createdAt: new Date(s.created_at).toISOString(),
        expiresAt: new Date(s.expires_at).toISOString(),
        userAgent: s.user_agent,
      })),
    };
    return body;
  });

  app.delete('/auth/sessions/:id', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const id = (req.params as { id: string }).id;
    if (id === guard.ctx.sessionId) {
      reply.code(400);
      return { error: 'Usá /logout para cerrar tu sesión actual.' };
    }
    // Sólo sesiones PROPIAS (where staff_member_id) → la de otro staff es 404.
    const res = await db.updateTable('staff_auth_sessions').set({ revoked_at: sql<string>`now()` })
      .where('id', '=', id)
      .where('staff_member_id', '=', guard.ctx.staff.id)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows ?? 0) === 0) {
      reply.code(404);
      return { error: 'Sesión no encontrada.' };
    }
    reply.code(204);
    return null;
  });
};
