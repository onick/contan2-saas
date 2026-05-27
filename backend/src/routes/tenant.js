import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';

// GET /api/_tenant — endpoint público intencional (sin auth) usado por
// `frontend/branding.js` para aplicar paleta/logo del tenant antes del
// login. NO debe protegerse con `requireStaffSession`: rompería la
// pantalla pre-auth de cualquier subdomain.
//
// Política (ver docs/migration-v2/05-authorization-matrix.md):
// payload allowlisted, solo metadata visual y operativa pública.
// Campos prohibidos en este endpoint (verificar con test):
//   - hashes de credenciales (`staffPinHash`)
//   - configuración interna (`emailReplyTo`, `emailFromAddr`)
//   - billing/plan/status del tenant
//   - cualquier secreto que se agregue al modelo a futuro
const PUBLIC_TENANT_FIELDS = [
  'slug',
  'name',
  'legalName',
  'logoUrl',
  'primaryColor',
  'secondaryColor',
  'sidebarStyle',
  'codePrefix',
  'locale',
  'timezone',
];

export function createTenantRouter() {
  const router = Router();

  router.get('/', (req, res, next) => {
    if (!req.organization) {
      return next(new HttpError(404, 'No hay organización en este host'));
    }
    const o = req.organization;
    const payload = {};
    for (const key of PUBLIC_TENANT_FIELDS) {
      payload[key] = o[key] ?? null;
    }
    // Default explícito para sidebarStyle (frontend asume 'brand' si null).
    if (!payload.sidebarStyle) payload.sidebarStyle = 'brand';
    res.json(payload);
  });

  return router;
}

// Exportado para tests: la suite tenant-payload.test.js verifica con
// snapshot que el payload no incluye campos sensibles aunque se agreguen
// al modelo de DB.
export { PUBLIC_TENANT_FIELDS };
