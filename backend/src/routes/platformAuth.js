// =============================================================================
// platformAuth.js · endpoints /api/platform/auth/* (super admin)
// =============================================================================

import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';
import { rateLimit } from '../utils/rateLimit.js';
import { requirePlatformAdmin, getPlatformCookieName } from '../middleware/requirePlatformAdmin.js';
import {
  login as svcLogin,
  logout as svcLogout,
  forgotPassword as svcForgotPassword,
  resetPassword as svcResetPassword,
  changePassword as svcChangePassword,
  publicAdmin,
} from '../services/auth/platformAuthService.js';
import { PlatformAdminRepository } from '../db/postgres/platform/PlatformAdminRepository.js';
import { PlatformSessionRepository } from '../db/postgres/platform/PlatformSessionRepository.js';
import { PlatformPasswordResetRepository } from '../db/postgres/platform/PlatformPasswordResetRepository.js';
import { initRepositories } from '../db/repositories.js';
import { listActiveSessions, revokeSession } from '../services/auth/sessionService.js';
import { config } from '../config.js';

const COOKIE = getPlatformCookieName();

const loginRateLimit = rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Demasiados intentos. Espera 15 minutos.' });
const forgotRateLimit = rateLimit({ windowMs: 15 * 60_000, max: 5, message: 'Demasiadas solicitudes.' });

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().optional(),
});
const forgotSchema = z.object({ email: z.string().email().max(255) });
const resetSchema = z.object({ token: z.string().min(10).max(200), newPassword: z.string().min(10).max(200) });
const changeSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(10).max(200) });

function getRepos() {
  return initRepositories().then(inst => ({
    admin: new PlatformAdminRepository(inst.pool),
    session: new PlatformSessionRepository(inst.pool),
    reset: new PlatformPasswordResetRepository(inst.pool),
  }));
}

function setSessionCookie(res, token, expiresAt) {
  const isProd = config.ROOT_DOMAIN !== 'localhost';
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt instanceof Date ? expiresAt : new Date(expiresAt),
  });
}
function clearSessionCookie(res) {
  const isProd = config.ROOT_DOMAIN !== 'localhost';
  res.clearCookie(COOKIE, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
}

export function createPlatformAuthRouter() {
  const router = Router();

  router.post('/login', loginRateLimit, async (req, res, next) => {
    try {
      if (config.DB_DRIVER !== 'postgres') throw new HttpError(503, 'Auth requiere Postgres');
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Datos inválidos', parsed.error.issues);
      const repos = await getRepos();
      const result = await svcLogin({
        repos,
        email: parsed.data.email,
        password: parsed.data.password,
        rememberMe: !!parsed.data.rememberMe,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      setSessionCookie(res, result.sessionToken, result.expiresAt);
      res.json({ ok: true, admin: result.admin, mustChangePassword: result.mustChangePassword });
    } catch (e) { next(e); }
  });

  router.post('/logout', requirePlatformAdmin, async (req, res, next) => {
    try {
      if (config.DB_DRIVER === 'postgres' && req.platformSessionId) {
        const repos = await getRepos();
        await svcLogout({ repos, sessionId: req.platformSessionId });
      }
      clearSessionCookie(res);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.get('/me', requirePlatformAdmin, (req, res) => {
    res.json({ admin: publicAdmin(req.platformAdmin), sessionId: req.platformSessionId });
  });

  router.post('/forgot-password', forgotRateLimit, async (req, res, next) => {
    try {
      const parsed = forgotSchema.safeParse(req.body);
      if (parsed.success && config.DB_DRIVER === 'postgres') {
        const repos = await getRepos();
        await svcForgotPassword({ repos, email: parsed.data.email, ip: req.ip, userAgent: req.get('User-Agent') });
      }
      res.json({ ok: true, message: 'Si el correo existe, te enviaremos instrucciones.' });
    } catch (e) { next(e); }
  });

  router.post('/reset-password', forgotRateLimit, async (req, res, next) => {
    try {
      if (config.DB_DRIVER !== 'postgres') throw new HttpError(503, 'Auth requiere Postgres');
      const parsed = resetSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Datos inválidos', parsed.error.issues);
      const repos = await getRepos();
      await svcResetPassword({ repos, token: parsed.data.token, newPassword: parsed.data.newPassword });
      res.json({ ok: true, message: 'Contraseña restablecida.' });
    } catch (e) { next(e); }
  });

  router.post('/change-password', requirePlatformAdmin, async (req, res, next) => {
    try {
      const parsed = changeSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Datos inválidos', parsed.error.issues);
      const repos = await getRepos();
      await svcChangePassword({
        repos,
        admin: req.platformAdmin,
        currentSessionId: req.platformSessionId,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      res.json({ ok: true, message: 'Contraseña actualizada.' });
    } catch (e) { next(e); }
  });

  router.get('/sessions', requirePlatformAdmin, async (req, res, next) => {
    try {
      const repos = await getRepos();
      const sessions = await listActiveSessions({ repo: repos.session, accountId: req.platformAdmin.id });
      res.json({
        sessions: sessions.map(s => ({
          id: s.id,
          current: s.id === req.platformSessionId,
          rememberMe: s.rememberMe,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
          userAgent: s.userAgent,
        })),
      });
    } catch (e) { next(e); }
  });

  router.delete('/sessions/:id', requirePlatformAdmin, async (req, res, next) => {
    try {
      if (req.params.id === req.platformSessionId) {
        throw new HttpError(400, 'Usa /logout para cerrar tu sesión actual.');
      }
      const repos = await getRepos();
      await revokeSession({ repo: repos.session, sessionId: req.params.id });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
}
