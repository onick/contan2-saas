// =============================================================================
// test/security/orgDomain-rbac.test.js
// =============================================================================
// Cubre el hardening de routes/orgDomain.js (custom domain self-service).
// Tier ADMIN/OWNER en todos los endpoints. Operator + scanner PIN + anónimo
// deben quedar fuera.
//
// Los tests positivos (operator → 403, owner → permitido, cross-tenant → 403)
// requieren Postgres real con staff sessions; quedan en la suite
// `test/security/postgres/*` con runIfPostgres.
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/app.js';

const ENDPOINTS = [
  { method: 'GET',    path: '/api/org/domain' },
  { method: 'PATCH',  path: '/api/org/domain',         body: { domain: 'example.com' } },
  { method: 'POST',   path: '/api/org/domain/verify' },
  { method: 'DELETE', path: '/api/org/domain' },
];

describe('orgDomain · anónimo rechazado en todos los endpoints', () => {
  ENDPOINTS.forEach(({ method, path, body }) => {
    it(`${method} ${path} sin cookie → no 200`, async () => {
      const app = await getTestApp();
      const req = request(app)[method.toLowerCase()](path).set('Host', 'ccb.localhost');
      const res = body ? await req.send(body) : await req;
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);
      expect(res.status).not.toBe(204);
      // No filtra `customDomain` ni `verifyToken` en el cuerpo.
      const text = JSON.stringify(res.body || {}).toLowerCase();
      expect(text).not.toContain('customdomain');
      expect(text).not.toContain('verifytoken');
    });
  });
});

describe('orgDomain · cookie legacy PIN (`ccb_staff`) no autoriza', () => {
  ENDPOINTS.forEach(({ method, path, body }) => {
    it(`${method} ${path} con cookie ccb_staff inválida → no 200`, async () => {
      const app = await getTestApp();
      const req = request(app)[method.toLowerCase()](path)
        .set('Host', 'ccb.localhost')
        .set('Cookie', 'ccb_staff=fake-legacy-pin-session');
      const res = body ? await req.send(body) : await req;
      // El nuevo middleware no debe aceptar la cookie legacy como sesión válida
      // para estos endpoints de configuración institucional.
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);
      expect(res.status).not.toBe(204);
    });
  });
});
