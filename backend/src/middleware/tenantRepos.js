import { createTenantRepos, CCB_ORG_ID } from '../db/repositories.js';
import { HttpError } from './errorHandler.js';

/**
 * Sprint 3: middleware que crea req.repos bindeado a la org resuelta.
 * Espera que resolveTenant haya corrido antes y poblado req.organizationId.
 */
export async function buildTenantRepos(req, res, next) {
  try {
    if (!req.organizationId) {
      return next(new HttpError(404, 'Recurso no disponible en este host'));
    }
    req.repos = await createTenantRepos(req.organizationId);
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Legacy / dev helper: si arrancas con DB_DRIVER=memory o sin tenant resolution,
 * fuerza al CCB para que la app siga funcionando.
 */
export function forceCcbTenant(req, res, next) {
  req.organizationId = CCB_ORG_ID;
  next();
}
