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
import { initRepositories } from '../db/repositories.js';
import { listActiveSessions, revokeSession } from '../services/auth/sessionService.js';
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
      const result = await svcLogin({
        organization: req.organization,
        repos,
        email: parsed.data.email,
        password: parsed.data.password,
        rememberMe: !!parsed.data.rememberMe,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      setSessionCookie(res, result.sessionToken, result.expiresAt);
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
      await svcResetPassword({
        repos,
        token: parsed.data.token,
        newPassword: parsed.data.newPassword,
      });
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

  return router;
}
