import { createTenantRepos, CCB_ORG_ID } from '../db/repositories.js';

/**
 * Sprint 2: tenant resolution hardcoded al CCB.
 *
 * Crea req.repos bindeado a una organización para cada request.
 * En Sprint 3 esto se reemplaza por resolveTenant() que mira el subdomain
 * y popula req.organization, y este middleware leerá req.organization.id.
 */
export function forceCcbTenant(req, res, next) {
  req.organizationId = CCB_ORG_ID;
  next();
}

export async function buildTenantRepos(req, res, next) {
  try {
    if (!req.organizationId) {
      return next(new Error('tenant no resuelto antes de buildTenantRepos'));
    }
    req.repos = await createTenantRepos(req.organizationId);
    next();
  } catch (e) {
    next(e);
  }
}
