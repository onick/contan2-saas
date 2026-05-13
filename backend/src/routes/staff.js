import { Router } from 'express';
import { config } from '../config.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  getCookieName,
  isSessionValid,
} from '../middleware/staffAuth.js';

const loginAttempts = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (entry.resetAt < now) {
    entry.count = 0;
    entry.resetAt = now + 60_000;
  }
  entry.count += 1;
  loginAttempts.set(ip, entry);
  return entry.count > 8;
}

export function createStaffRouter() {
  const router = Router();

  router.post('/login', (req, res, next) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (rateLimited(ip)) {
        throw new HttpError(429, 'Demasiados intentos. Espera 1 minuto.');
      }
      const pin = String(req.body?.pin || '').trim();
      if (!pin) throw new HttpError(400, 'PIN requerido');
      if (pin !== config.STAFF_PIN) {
        throw new HttpError(401, 'PIN incorrecto');
      }
      const { id, expiresAt } = createSession();
      setSessionCookie(res, id, expiresAt);
      res.json({ ok: true, expiresAt: new Date(expiresAt).toISOString() });
    } catch (e) {
      next(e);
    }
  });

  router.post('/logout', (req, res) => {
    const sid = req.cookies?.[getCookieName()];
    if (sid) destroySession(sid);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    const sid = req.cookies?.[getCookieName()];
    res.json({ authenticated: isSessionValid(sid) });
  });

  return router;
}
