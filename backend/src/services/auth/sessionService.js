// =============================================================================
// sessionService.js · creación, validación y revocación de sesiones.
//
// Diseño:
// - Sesiones son tokens opacos (64 chars hex). El plain va al cliente
//   (cookie HttpOnly), el sha256 va a la DB.
// - Polimórfico: trabaja con staff_sessions O platform_sessions según el
//   repo que se le pase (interfaz común: create, findByTokenHash, revoke,
//   revokeAllForAccount).
// - El servicio NO sabe de Express ni cookies: solo de tokens y persistence.
//   El router que lo llama es quien setea/lee la cookie.
// =============================================================================

import { generateOpaqueToken, hashToken } from './passwordService.js';
import { createHash } from 'node:crypto';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Repositorio de sesiones (interfaz común). Implementaciones concretas:
 * - StaffSessionRepository
 * - PlatformSessionRepository
 *
 * Debe exponer:
 *   create({ accountId, tokenHash, expiresAt, rememberMe, ipHash, userAgent }) → row
 *   findByTokenHash(tokenHash) → row | null
 *   revoke(sessionId) → void
 *   revokeAllForAccount(accountId, exceptSessionId?) → void
 *   listActiveForAccount(accountId) → row[]
 */

/**
 * Crea una sesión y devuelve el token plano (para setear como cookie).
 *
 * @param {Object} args
 * @param {Object} args.repo session repo (staff o platform)
 * @param {string} args.accountId UUID de staff_member o platform_admin
 * @param {boolean} args.rememberMe true → 30 días, false → 12 horas
 * @param {string} [args.ip] IP del cliente, se hashea sha256 antes de guardar
 * @param {string} [args.userAgent] truncado a 256 chars
 * @returns {Promise<{ token: string, expiresAt: Date }>}
 */
export async function createSession({ repo, accountId, rememberMe, ip, userAgent }) {
  if (!repo) throw new Error('createSession: repo requerido');
  if (!accountId) throw new Error('createSession: accountId requerido');
  const { plain, hash } = generateOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (rememberMe ? THIRTY_DAYS_MS : TWELVE_HOURS_MS));
  await repo.create({
    accountId,
    tokenHash: hash,
    expiresAt,
    rememberMe: !!rememberMe,
    ipHash: ip ? sha256(ip) : null,
    userAgent: userAgent ? String(userAgent).slice(0, 256) : null,
  });
  return { token: plain, expiresAt };
}

/**
 * Valida un token de sesión. Devuelve la fila si existe, no está expirada
 * ni revocada; null en cualquier otro caso.
 *
 * Side effects: ninguno (no toca last_seen ni nada). Si el caller quiere
 * actualizar "última actividad", lo hace él.
 *
 * @param {Object} args
 * @param {Object} args.repo
 * @param {string} args.token token plano (del cookie)
 * @returns {Promise<Object|null>} fila de sesión, o null si inválida
 */
export async function validateSession({ repo, token }) {
  if (!repo || !token || typeof token !== 'string') return null;
  const tokenHash = hashToken(token);
  const session = await repo.findByTokenHash(tokenHash);
  if (!session) return null;
  if (session.revokedAt) return null;
  const expires = session.expiresAt instanceof Date ? session.expiresAt : new Date(session.expiresAt);
  if (expires.getTime() <= Date.now()) return null;
  return session;
}

/**
 * Revoca una sesión específica (logout).
 *
 * @param {Object} args
 * @param {Object} args.repo
 * @param {string} args.sessionId
 */
export async function revokeSession({ repo, sessionId }) {
  if (!repo || !sessionId) return;
  await repo.revoke(sessionId);
}

/**
 * Revoca todas las sesiones de una cuenta, opcionalmente excluyendo una
 * (típicamente, la sesión actual del usuario que está cambiando su pass).
 *
 * @param {Object} args
 * @param {Object} args.repo
 * @param {string} args.accountId
 * @param {string} [args.exceptSessionId] sesión a preservar (la actual)
 */
export async function revokeAllOtherSessions({ repo, accountId, exceptSessionId }) {
  if (!repo || !accountId) return;
  await repo.revokeAllForAccount(accountId, exceptSessionId);
}

/**
 * Lista las sesiones activas de una cuenta (para la página "Mis sesiones").
 *
 * @param {Object} args
 * @param {Object} args.repo
 * @param {string} args.accountId
 * @returns {Promise<Array>}
 */
export async function listActiveSessions({ repo, accountId }) {
  if (!repo || !accountId) return [];
  return repo.listActiveForAccount(accountId);
}

function sha256(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

export const SESSION_TTL = Object.freeze({
  DEFAULT_MS: TWELVE_HOURS_MS,
  REMEMBER_ME_MS: THIRTY_DAYS_MS,
});
