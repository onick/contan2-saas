// =============================================================================
// requireStaffSession · middleware que valida la cookie de sesión nueva
// (tenant staff). ÚNICA fuente válida de identidad para tier STAFF/ADMIN/OWNER.
// =============================================================================
// El sistema PIN legacy (cookie `ccb_staff`) está estrictamente aislado en
// los endpoints `/api/staff/*` (login/logout/me) y NO atraviesa este guard
// bajo ninguna circunstancia. Antes existía un fallback "backward-compatible"
// que aceptaba la cookie PIN cuando no había `contan2_session`; ese fallback
// se removió porque permitía bypass de RBAC: una sesión PIN válida copiada
// a una cookie `contan2_staff` autorizaba endpoints del tier nuevo, saltándose
// el rol (operator/admin/owner) por completo.
//
// La cookie aceptada es UNA SOLA: `contan2_session`. Ningún alias, ninguna
// delegación. La sesión vive en `staff_auth_sessions` y está scoped por
// organization vía StaffMemberRepository.
// =============================================================================

import { HttpError } from './errorHandler.js';
import { validateSession } from '../services/auth/sessionService.js';
import { StaffSessionRepository } from '../db/postgres/platform/StaffSessionRepository.js';
import { StaffMemberRepository } from '../db/postgres/platform/StaffMemberRepository.js';
import { initRepositories } from '../db/repositories.js';
import { config } from '../config.js';

const SESSION_COOKIE = 'contan2_session';

export function getSessionCookieName() { return SESSION_COOKIE; }

/**
 * Middleware Express: valida la sesión, popula `req.currentStaff` y
 * `req.currentSessionId`. 401 si no hay sesión.
 *
 * El único origen de identidad aceptado es la cookie `contan2_session` con
 * un token plano cuya hash sha256 coincide con una fila viva (no expirada,
 * no revocada) en `staff_auth_sessions`.
 */
export async function requireStaffSession(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next(new HttpError(401, 'No autenticado'));

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
