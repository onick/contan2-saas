import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';

export function createTenantRouter() {
  const router = Router();

  router.get('/', (req, res, next) => {
    if (!req.organization) {
      return next(new HttpError(404, 'No hay organización en este host'));
    }
    const o = req.organization;
    res.json({
      slug: o.slug,
      name: o.name,
      legalName: o.legalName,
      logoUrl: o.logoUrl,
      primaryColor: o.primaryColor,
      secondaryColor: o.secondaryColor,
      codePrefix: o.codePrefix,
      locale: o.locale,
      timezone: o.timezone,
      plan: o.plan,
      status: o.status,
    });
  });

  return router;
}
