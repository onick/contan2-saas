import { randomBytes } from 'crypto';
import { config } from '../config.js';
import { HttpError } from './errorHandler.js';

const COOKIE_NAME = 'ccb_staff';
const sessions = new Map();

function newSessionId() {
  return randomBytes(24).toString('hex');
}

function cleanup() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(id);
  }
}

setInterval(cleanup, 10 * 60 * 1000).unref();

export function createSession() {
  const id = newSessionId();
  const expiresAt = Date.now() + config.SESSION_TTL_MS;
  sessions.set(id, { expiresAt });
  return { id, expiresAt };
}

export function destroySession(id) {
  sessions.delete(id);
}

export function isSessionValid(id) {
  if (!id) return false;
  const s = sessions.get(id);
  if (!s) return false;
  if (s.expiresAt < Date.now()) {
    sessions.delete(id);
    return false;
  }
  return true;
}

export function setSessionCookie(res, id, expiresAt) {
  res.cookie(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function getCookieName() {
  return COOKIE_NAME;
}

export function requireStaff(req, res, next) {
  const sid = req.cookies?.[COOKIE_NAME];
  if (!isSessionValid(sid)) {
    return next(new HttpError(401, 'No autenticado'));
  }
  next();
}
