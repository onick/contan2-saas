// =============================================================================
// test/security/public-stays-public.test.js
// =============================================================================
// Verifica que el hardening P0 NO rompió los endpoints públicos legítimos:
// kiosko (/api/public/*), RSVP, eventos públicos, /api/_tenant, login pages.
//
// Estos endpoints DEBEN seguir respondiendo a anónimos. Si alguno empieza
// a devolver 401, rompimos algo y el kiosko en producción dejaría de
// funcionar para visitantes.
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/app.js';

const PUBLIC_ENDPOINTS = [
  { method: 'GET', path: '/api/_tenant',           expectedOk: true },
  { method: 'GET', path: '/api/public/activities', expectedOk: true },
  { method: 'GET', path: '/healthz',               expectedOk: true },
  // Endpoints de auth login — deben aceptar el POST (luego fallan validation o credenciales, eso no nos importa acá)
  { method: 'POST', path: '/api/auth/login',       body: {}, allowedStatuses: [400, 401, 422, 503] },
  { method: 'POST', path: '/api/auth/forgot-password', body: { email: 'x@x.com' }, allowedStatuses: [200, 202, 400, 503] },
  // Platform auth
  { method: 'POST', path: '/api/platform/auth/login', body: {}, allowedStatuses: [400, 401, 422, 503] },
  // Landing
  { method: 'POST', path: '/api/landing/contact',  body: { name: 'X', email: 'x@x.com', message: 'hola' }, allowedStatuses: [200, 201, 400, 503] },
  // Legacy PIN scanner — debe seguir aceptando requests como PUBLIC (no
  // gated por requireStaffSession). Aceptamos 500 con memory driver porque
  // el handler internal puede fallar al no encontrar el hash de PIN.
  { method: 'POST', path: '/api/staff/login',      body: { pin: 'wrong' }, allowedStatuses: [400, 401, 403, 500, 503] },
];

describe('endpoints públicos legítimos siguen respondiendo', () => {
  PUBLIC_ENDPOINTS.forEach(({ method, path, body, expectedOk, allowedStatuses }) => {
    it(`${method} ${path} responde sin cookie de sesión`, async () => {
      const app = await getTestApp();
      const req = request(app)[method.toLowerCase()](path);
      req.set('Host', 'ccb.localhost');
      const res = body ? await req.send(body) : await req;
      if (expectedOk) {
        // 200/204 esperados; 503 si memory driver no soporta el flujo.
        expect([200, 204, 503]).toContain(res.status);
      } else if (allowedStatuses) {
        expect(allowedStatuses).toContain(res.status);
      }
      // 401 como "credenciales/PIN incorrecto" es válido en endpoints de
      // login; lo prohibimos solo cuando NO está en allowedStatuses (caso en
      // que un público debería responder, p.ej., GET /api/_tenant).
      if (!allowedStatuses || !allowedStatuses.includes(401)) {
        expect(res.status).not.toBe(401);
      }
    });
  });
});
