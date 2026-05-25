// =============================================================================
// auth.js · endpoints /api/auth/* para staff de tenant
// =============================================================================

import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';
import { rateLimit } from '../utils/rateLimit.js';
import { requireStaffSession, getSessionCookieName } from '../middleware/requireStaffSession.js';
import {
  login as svcLogin,
  logout as svcLogout,
  forgotPassword as svcForgotPassword,
  resetPassword as svcResetPassword,
  changePassword as svcChangePassword,
  publicStaff,
} from '../services/auth/tenantAuthService.js';
import { StaffMemberRepository } from '../db/postgres/platform/StaffMemberRepository.js';
import { StaffSessionRepository } from '../db/postgres/platform/StaffSessionRepository.js';
import { StaffPasswordResetRepository } from '../db/postgres/platform/StaffPasswordResetRepository.js';
import { StaffInvitationRepository } from '../db/postgres/platform/StaffInvitationRepository.js';
import { initRepositories } from '../db/repositories.js';
import { listActiveSessions, revokeSession } from '../services/auth/sessionService.js';
import { recordAudit } from '../services/auth/auditService.js';
import { hashPassword, generateOpaqueToken, hashToken, validatePasswordStrength } from '../services/auth/passwordService.js';
import { maskEmail } from '../utils/log.js';
import { config } from '../config.js';

const COOKIE_NAME = getSessionCookieName();

const loginRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  message: 'Demasiados intentos. Espera 15 minutos.',
});

const forgotRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  message: 'Demasiadas solicitudes. Espera 15 minutos.',
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().optional(),
});

const forgotSchema = z.object({
  email: z.string().email().max(255),
});

const resetSchema = z.object({
  token: z.string().min(10).max(200),
  newPassword: z.string().min(10).max(200),
});

const changeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
});

function getRepos() {
  return initRepositories().then(inst => ({
    staff: new StaffMemberRepository(inst.pool),
    session: new StaffSessionRepository(inst.pool),
    reset: new StaffPasswordResetRepository(inst.pool),
  }));
}

function setSessionCookie(res, token, expiresAt) {
  const isProd = config.ROOT_DOMAIN !== 'localhost';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt instanceof Date ? expiresAt : new Date(expiresAt),
  });
}

function clearSessionCookie(res) {
  const isProd = config.ROOT_DOMAIN !== 'localhost';
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });
}

export function createAuthRouter() {
  const router = Router();

  // POST /api/auth/login
  router.post('/login', loginRateLimit, async (req, res, next) => {
    try {
      if (!req.organization) throw new HttpError(404, 'Tenant no encontrado');
      if (config.DB_DRIVER !== 'postgres') throw new HttpError(503, 'Auth requiere Postgres');
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Datos inválidos', parsed.error.issues);
      const repos = await getRepos();
      let result;
      try {
        result = await svcLogin({
          organization: req.organization,
          repos,
          email: parsed.data.email,
          password: parsed.data.password,
          rememberMe: !!parsed.data.rememberMe,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
      } catch (e) {
        // Audit del fallo. No tenemos currentStaff aún.
        recordAudit({
          req,
          action: 'auth.login_failed',
          actorOverride: { emailMasked: maskEmail(parsed.data.email) },
          organizationIdOverride: req.organization.id,
          metadata: { reason: e.status === 423 ? 'lockout' : 'bad_credentials' },
        }).catch(() => {});
        throw e;
      }
      setSessionCookie(res, result.sessionToken, result.expiresAt);
      recordAudit({
        req,
        action: 'auth.login',
        actorOverride: {
          staffId: result.staff.id,
          emailMasked: maskEmail(result.staff.email),
          role: result.staff.role,
        },
        organizationIdOverride: req.organization.id,
        metadata: { rememberMe: !!parsed.data.rememberMe },
      }).catch(() => {});
      res.json({
        ok: true,
        staff: result.staff,
        mustChangePassword: result.mustChangePassword,
      });
    } catch (e) { next(e); }
  });

  // POST /api/auth/logout
  router.post('/logout', requireStaffSession, async (req, res, next) => {
    try {
      if (config.DB_DRIVER === 'postgres' && req.currentSessionId) {
        const repos = await getRepos();
        await svcLogout({ repos, sessionId: req.currentSessionId });
      }
      clearSessionCookie(res);
      recordAudit({ req, action: 'auth.logout' }).catch(() => {});
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // GET /api/auth/me
  router.get('/me', requireStaffSession, (req, res) => {
    res.json({ staff: publicStaff(req.currentStaff), sessionId: req.currentSessionId });
  });

  // POST /api/auth/forgot-password
  router.post('/forgot-password', forgotRateLimit, async (req, res, next) => {
    try {
      if (!req.organization) throw new HttpError(404, 'Tenant no encontrado');
      const parsed = forgotSchema.safeParse(req.body);
      // Responde 200 incluso si schema falla — no leak de qué emails existen
      if (parsed.success && config.DB_DRIVER === 'postgres') {
        const repos = await getRepos();
        await svcForgotPassword({
          organization: req.organization,
          repos,
          email: parsed.data.email,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
      }
      res.json({ ok: true, message: 'Si el correo existe, te enviaremos instrucciones.' });
    } catch (e) { next(e); }
  });

  // POST /api/auth/reset-password
  router.post('/reset-password', forgotRateLimit, async (req, res, next) => {
    try {
      if (config.DB_DRIVER !== 'postgres') throw new HttpError(503, 'Auth requiere Postgres');
      const parsed = resetSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Datos inválidos', parsed.error.issues);
      const repos = await getRepos();
      const ret = await svcResetPassword({
        repos,
        token: parsed.data.token,
        newPassword: parsed.data.newPassword,
      });
      // ret.staff puede no venir; pero podemos buscar por hash si fuera necesario.
      // Por simplicidad sin retornar el staff, omitimos actor; el organizationId
      // viene del req (path en custom domain → resolveTenant ya lo pobló).
      recordAudit({ req, action: 'auth.password_reset_used' }).catch(() => {});
      res.json({ ok: true, message: 'Contraseña restablecida. Inicia sesión con la nueva.' });
    } catch (e) { next(e); }
  });

  // POST /api/auth/change-password (autenticado)
  router.post('/change-password', requireStaffSession, async (req, res, next) => {
    try {
      const parsed = changeSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Datos inválidos', parsed.error.issues);
      const repos = await getRepos();
      await svcChangePassword({
        repos,
        staff: req.currentStaff,
        currentSessionId: req.currentSessionId,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      recordAudit({ req, action: 'auth.password_changed' }).catch(() => {});
      res.json({ ok: true, message: 'Contraseña actualizada.' });
    } catch (e) { next(e); }
  });

  // GET /api/auth/sessions
  router.get('/sessions', requireStaffSession, async (req, res, next) => {
    try {
      const repos = await getRepos();
      const sessions = await listActiveSessions({
        repo: repos.session,
        accountId: req.currentStaff.id,
      });
      res.json({
        sessions: sessions.map(s => ({
          id: s.id,
          current: s.id === req.currentSessionId,
          rememberMe: s.rememberMe,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
          userAgent: s.userAgent,
        })),
      });
    } catch (e) { next(e); }
  });

  // DELETE /api/auth/sessions/:id
  router.delete('/sessions/:id', requireStaffSession, async (req, res, next) => {
    try {
      if (req.params.id === req.currentSessionId) {
        throw new HttpError(400, 'Usa /logout para cerrar tu sesión actual.');
      }
      const repos = await getRepos();
      await revokeSession({ repo: repos.session, sessionId: req.params.id });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  // ------ Invitaciones (públicas: aceptar) ------

  // GET /api/auth/invitation/:token — preview (sin auth).
  router.get('/invitation/:token', async (req, res, next) => {
    try {
      if (config.DB_DRIVER !== 'postgres') throw new HttpError(503, 'Auth requiere Postgres');
      const inst = await initRepositories();
      const invRepo = new StaffInvitationRepository(inst.pool);
      const inv = await invRepo.findByTokenHash(hashToken(req.params.token));
      if (!inv) return res.status(404).json({ error: 'Invitación no encontrada' });
      if (inv.status !== 'pending') return res.status(410).json({ error: `Invitación ${inv.status}` });
      if (new Date(inv.expiresAt) < new Date()) {
        return res.status(410).json({ error: 'Invitación expirada' });
      }
      // Mostramos info mínima: organización + email + role.
      const { OrganizationRepository } = await import('../db/postgres/platform/OrganizationRepository.js');
      const orgRepo = new OrganizationRepository(inst.pool);
      const org = await orgRepo.findById(inv.organizationId);
      res.json({
        invitation: {
          email: inv.email,
          fullName: inv.fullName,
          role: inv.role,
          expiresAt: inv.expiresAt,
          organization: org ? { id: org.id, slug: org.slug, name: org.name } : null,
        },
      });
    } catch (e) { next(e); }
  });

  // POST /api/auth/accept-invitation — { token, password, fullName? }
  const acceptInvRateLimit = rateLimit({ windowMs: 60 * 60_000, max: 10,
    message: 'Demasiados intentos. Espera una hora.' });
  router.post('/accept-invitation', acceptInvRateLimit, async (req, res, next) => {
    try {
      if (config.DB_DRIVER !== 'postgres') throw new HttpError(503, 'Auth requiere Postgres');
      const { token, password, fullName } = req.body || {};
      if (!token || typeof token !== 'string') throw new HttpError(400, 'Token requerido');
      if (!password || typeof password !== 'string') throw new HttpError(400, 'Contraseña requerida');
      const strengthErrs = validatePasswordStrength(password);
      if (strengthErrs.length) throw new HttpError(400, 'Password débil: ' + strengthErrs.join(', '));

      const inst = await initRepositories();
      const invRepo = new StaffInvitationRepository(inst.pool);
      const staffRepo = new StaffMemberRepository(inst.pool);

      const inv = await invRepo.findByTokenHash(hashToken(token));
      if (!inv) throw new HttpError(404, 'Invitación no encontrada');
      if (inv.status !== 'pending') throw new HttpError(410, `Invitación ${inv.status}`);
      if (new Date(inv.expiresAt) < new Date()) throw new HttpError(410, 'Invitación expirada');

      // Si ya existe un staff con ese email en la org (race condition o
      // re-aceptación de invitación duplicada), no creamos otro.
      const existing = await staffRepo.findByEmail(inv.organizationId, inv.email);
      if (existing) {
        throw new HttpError(409, 'Ya existe una cuenta con este correo. Usa "Olvidé mi contraseña".');
      }

      const finalName = (fullName && String(fullName).trim()) || inv.fullName || inv.email.split('@')[0];
      const passwordHash = await hashPassword(password);

      const staff = await staffRepo.create({
        organizationId: inv.organizationId,
        email: inv.email,
        passwordHash,
        fullName: finalName,
        mustChangePassword: false,
        role: inv.role,
      });

      await invRepo.markAccepted(inv.id, staff.id);

      recordAudit({
        req,
        action: 'staff.invite_accepted',
        organizationIdOverride: inv.organizationId,
        actorOverride: {
          staffId: staff.id,
          emailMasked: maskEmail(staff.email),
          role: staff.role,
        },
        targetType: 'staff_invitation',
        targetId: inv.id,
        targetLabel: inv.email,
        metadata: { role: inv.role },
      }).catch(() => {});

      res.json({ ok: true, message: 'Invitación aceptada. Ya puedes iniciar sesión.' });
    } catch (e) { next(e); }
  });

  return router;
}
