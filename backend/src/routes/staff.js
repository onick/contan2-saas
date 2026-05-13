import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import {
  createStaffSession,
  destroyStaffSession,
  getStaffSession,
  setStaffCookie,
  clearStaffCookie,
  getStaffCookieName,
} from '../middleware/staffAuth.js';
import { verifyPin } from '../services/staffPin.js';

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

  router.post('/login', async (req, res, next) => {
    try {
      if (!req.organization) {
        throw new HttpError(400, 'Login no disponible sin tenant');
      }
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (rateLimited(ip)) {
        throw new HttpError(429, 'Demasiados intentos. Espera 1 minuto.');
      }
      const pin = String(req.body?.pin || '').trim();
      if (!pin) throw new HttpError(400, 'PIN requerido');

      const hash = req.organization.staffPinHash;
      if (!hash) {
        throw new HttpError(500, 'Organización sin PIN configurado');
      }
      const ok = await verifyPin(pin, hash);
      if (!ok) throw new HttpError(401, 'PIN incorrecto');

      const { id, expiresAt } = await createStaffSession({
        organizationId: req.organization.id,
        ip,
        userAgent: req.headers['user-agent'],
      });
      setStaffCookie(res, id, expiresAt);
      res.json({ ok: true, expiresAt });
    } catch (e) {
      next(e);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const sid = req.cookies?.[getStaffCookieName()];
      if (sid) await destroyStaffSession(sid);
      clearStaffCookie(res);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.get('/me', async (req, res, next) => {
    try {
      const sid = req.cookies?.[getStaffCookieName()];
      const session = await getStaffSession(sid);
      const authenticated =
        !!session && (!req.organization || session.organizationId === req.organization.id);
      res.json({ authenticated });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
