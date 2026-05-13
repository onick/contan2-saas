import { randomBytes } from 'crypto';
import { config } from '../config.js';
import { initRepositories } from '../db/repositories.js';
import { HttpError } from './errorHandler.js';

const COOKIE_NAME = 'ccb_staff';
const TTL_MS = (Number(process.env.STAFF_SESSION_TTL_HOURS) || 12) * 60 * 60 * 1000;

// In-memory fallback para DB_DRIVER=memory (dev legacy)
const memSessions = new Map();
function memCleanup() {
  const now = Date.now();
  for (const [id, s] of memSessions) {
    if (s.expiresAt < now) memSessions.delete(id);
  }
}
setInterval(memCleanup, 10 * 60 * 1000).unref();

function newSessionId() {
  return randomBytes(24).toString('hex');
}

export async function createStaffSession({ organizationId, ip, userAgent }) {
  const id = newSessionId();
  const expiresAt = new Date(Date.now() + TTL_MS);

  if (config.DB_DRIVER === 'memory') {
    memSessions.set(id, { organizationId, expiresAt: expiresAt.getTime() });
    return { id, expiresAt: expiresAt.toISOString() };
  }

  const inst = await initRepositories();
  await inst.pool.query(
    `INSERT INTO staff_sessions (id, organization_id, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, organizationId, ip || null, userAgent || null, expiresAt],
  );
  return { id, expiresAt: expiresAt.toISOString() };
}

export async function destroyStaffSession(id) {
  if (!id) return;
  if (config.DB_DRIVER === 'memory') {
    memSessions.delete(id);
    return;
  }
  const inst = await initRepositories();
  await inst.pool.query('DELETE FROM staff_sessions WHERE id = $1', [id]);
}

export async function getStaffSession(id) {
  if (!id) return null;
  if (config.DB_DRIVER === 'memory') {
    const s = memSessions.get(id);
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
      memSessions.delete(id);
      return null;
    }
    return { organizationId: s.organizationId };
  }
  const inst = await initRepositories();
  const { rows } = await inst.pool.query(
    'SELECT organization_id, expires_at FROM staff_sessions WHERE id = $1',
    [id],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (new Date(row.expires_at) < new Date()) {
    await inst.pool.query('DELETE FROM staff_sessions WHERE id = $1', [id]);
    return null;
  }
  return { organizationId: row.organization_id };
}

export function setStaffCookie(res, id, expiresAt) {
  res.cookie(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.PUBLIC_URL.startsWith('https'),
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearStaffCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function getStaffCookieName() {
  return COOKIE_NAME;
}

/**
 * Middleware que valida que el staff esté autenticado Y la sesión pertenezca
 * al tenant actual (req.organization). Si la sesión es de otra org, falla.
 */
export async function requireStaff(req, res, next) {
  try {
    const sid = req.cookies?.[COOKIE_NAME];
    const session = await getStaffSession(sid);
    if (!session) return next(new HttpError(401, 'No autenticado'));
    if (req.organizationId && session.organizationId !== req.organizationId) {
      return next(new HttpError(403, 'Sesión de otra organización'));
    }
    req.staffSession = session;
    next();
  } catch (e) {
    next(e);
  }
}
