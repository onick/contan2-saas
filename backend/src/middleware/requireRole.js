// =============================================================================
// requireRole · middleware de autorización por rol del staff.
// Se compone DESPUÉS de requireStaffSession.
// =============================================================================

import { HttpError } from './errorHandler.js';

/**
 * @param {string[]} allowed roles permitidos, ej ['owner','admin']
 */
export function requireRole(allowed) {
  if (!Array.isArray(allowed) || allowed.length === 0) {
    throw new Error('requireRole(): se requiere un array de roles');
  }
  const set = new Set(allowed);

  return function (req, _res, next) {
    if (!req.currentStaff) {
      return next(new HttpError(401, 'No autenticado'));
    }
    if (!set.has(req.currentStaff.role)) {
      return next(new HttpError(403, 'No tienes permiso para esta acción.'));
    }
    next();
  };
}
