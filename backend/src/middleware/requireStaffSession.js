// =============================================================================
// requireStaffSession · middleware que valida la cookie de sesión nueva
// (tenant staff). Reemplaza gradualmente al requireStaff legacy (PIN).
//
// Modo backward-compatible: si NO hay cookie nueva pero SÍ existe la
// cookie PIN, delega al middleware viejo (deprecation period).
// =============================================================================

import { HttpError } from './errorHandler.js';
import { validateSession } from '../services/auth/sessionService.js';
import { StaffSessionRepository } from '../db/postgres/platform/StaffSessionRepository.js';
import { StaffMemberRepository } from '../db/postgres/platform/StaffMemberRepository.js';
import { initRepositories } from '../db/repositories.js';
import { config } from '../config.js';
import { requireStaff as legacyRequirePin } from './staffAuth.js';

const SESSION_COOKIE = 'contan2_session';

export function getSessionCookieName() { return SESSION_COOKIE; }

/**
 * Middleware Express: valida la sesión, popula `req.currentStaff` y
 * `req.currentSessionId`. 401 si no hay sesión.
 *
 * Si hay cookie del nuevo sistema, la usa.
 * Si NO la hay pero SÍ está la del PIN legacy, delega al middleware viejo
 * (solo durante el período de deprecación; se removerá después de T+7 días).
 */
export async function requireStaffSession(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];

    if (!token) {
      // Fallback al PIN legacy si la otra cookie existe
      if (req.cookies?.contan2_staff) {
        console.log('[auth] usando PIN legacy (deprecated) para', req.method, req.path);
        return legacyRequirePin(req, res, next);
      }
      return next(new HttpError(401, 'No autenticado'));
    }

    if (config.DB_DRIVER !== 'postgres') {
      return next(new HttpError(503, 'Auth requiere DB_DRIVER=postgres'));
    }

    const inst = await initRepositories();
    const sessionRepo = new StaffSessionRepository(inst.pool);
    const staffRepo = new StaffMemberRepository(inst.pool);

    const session = await validateSession({ repo: sessionRepo, token });
    if (!session) return next(new HttpError(401, 'Sesión expirada o inválida'));

    const staff = await staffRepo.findById(session.accountId);
    if (!staff || staff.status !== 'active') {
      return next(new HttpError(401, 'Cuenta no disponible'));
    }

    if (req.organizationId && staff.organizationId !== req.organizationId) {
      // Cross-tenant: la sesión es de otra org. No permitido.
      return next(new HttpError(403, 'Sesión de otra organización'));
    }

    req.currentStaff = staff;
    req.currentSessionId = session.id;
    next();
  } catch (e) {
    next(e);
  }
}
