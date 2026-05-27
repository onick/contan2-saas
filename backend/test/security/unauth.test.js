// =============================================================================
// test/security/unauth.test.js
// =============================================================================
// Verifica que cada endpoint PRIVADO de la matriz de autorización
// (docs/migration-v2/05-authorization-matrix.md) rechaza requests anónimas.
//
// "Rechazar" = NO devolver 200 con datos del tenant. Aceptamos 401 (sin
// cookie), 403 (con cookie inválida), 503 (memory driver no soporta
// validación de sesión). Lo crítico es que NO sea 200.
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/app.js';

const PRIVATE_ENDPOINTS = [
  // users.js — V001
  { method: 'GET',    path: '/api/users' },
  { method: 'POST',   path: '/api/users',                body: { firstName: 'X', lastName: 'Y' } },
  { method: 'POST',   path: '/api/users/bulk',           body: { users: [] } },
  { method: 'GET',    path: '/api/users/CCB-XXXXXX' },
  { method: 'PATCH',  path: '/api/users/CCB-XXXXXX/visit' },
  { method: 'PUT',    path: '/api/users/CCB-XXXXXX',     body: { firstName: 'X', lastName: 'Y' } },
  { method: 'DELETE', path: '/api/users/CCB-XXXXXX' },
  // activities.js — V002
  { method: 'GET',    path: '/api/activities' },
  { method: 'POST',   path: '/api/activities',           body: { name: 'X', type: 'cine', date: '2026-12-01T00:00:00Z', location: 'Y', capacity: 1 } },
  { method: 'GET',    path: '/api/activities/abc' },
  { method: 'GET',    path: '/api/activities/abc/attendees' },
  { method: 'PUT',    path: '/api/activities/abc',       body: { name: 'X', type: 'cine', date: '2026-12-01T00:00:00Z', location: 'Y', capacity: 1 } },
  { method: 'DELETE', path: '/api/activities/abc' },
  { method: 'GET',    path: '/api/activities/abc/invitations' },
  { method: 'POST',   path: '/api/activities/abc/invitations', body: { userIds: [] } },
  { method: 'DELETE', path: '/api/activities/abc/invitations/xyz' },
  // attendance.js — V003 (incluye /anonymous)
  { method: 'GET',    path: '/api/attendance' },
  { method: 'POST',   path: '/api/attendance',           body: { userCode: 'CCB-XXXXXX', activityId: 'abc' } },
  { method: 'POST',   path: '/api/attendance/anonymous', body: { activityId: 'abc' } },
  { method: 'GET',    path: '/api/attendance/by-user/CCB-XXXXXX' },
  { method: 'GET',    path: '/api/attendance/by-activity/abc' },
  { method: 'DELETE', path: '/api/attendance/abc' },
  // dashboard.js — V004
  { method: 'GET',    path: '/api/dashboard/stats' },
  { method: 'GET',    path: '/api/dashboard/checkin-context' },
  // insights.js — V005
  { method: 'GET',    path: '/api/insights/user-affinity/CCB-XXXXXX' },
  { method: 'GET',    path: '/api/insights/suggestions' },
  { method: 'GET',    path: '/api/insights/segments' },
  { method: 'GET',    path: '/api/insights/segments/vip' },
  { method: 'GET',    path: '/api/insights/activity-summary/abc' },
  // reports.js — V006
  { method: 'GET',    path: '/api/reports/activity/abc.xlsx' },
  { method: 'GET',    path: '/api/reports/activity/abc.pdf' },
  { method: 'GET',    path: '/api/reports/period.xlsx?from=2026-01-01&to=2026-01-31' },
  { method: 'GET',    path: '/api/reports/period.pdf?from=2026-01-01&to=2026-01-31' },
  { method: 'GET',    path: '/api/reports/period/preview?from=2026-01-01&to=2026-01-31' },
  // uploads.js — V007
  { method: 'POST',   path: '/api/uploads/image' },
  // orgBranding.js — V008
  { method: 'GET',    path: '/api/org/branding' },
  { method: 'PATCH',  path: '/api/org/branding',         body: { primaryColor: '#123456' } },
  // credentials.js — V008b
  { method: 'POST',   path: '/api/credentials/CCB-XXXXXX/send' },
  { method: 'POST',   path: '/api/credentials/bulk-send', body: { codes: ['CCB-XXXXXX'] } },
  // orgDomain.js — todos ADMIN/OWNER
  { method: 'GET',    path: '/api/org/domain' },
  { method: 'PATCH',  path: '/api/org/domain',          body: { domain: 'example.com' } },
  { method: 'POST',   path: '/api/org/domain/verify' },
  { method: 'DELETE', path: '/api/org/domain' },
];

describe('P0 · endpoints privados rechazan requests anónimas', () => {
  PRIVATE_ENDPOINTS.forEach(({ method, path, body }) => {
    it(`${method} ${path} → no 200 sin cookie de sesión`, async () => {
      const app = await getTestApp();
      const req = request(app)[method.toLowerCase()](path);
      // Forzar Host del tenant CCB para que resolveTenant lo encuentre.
      req.set('Host', 'ccb.localhost');
      const res = body ? await req.send(body) : await req;
      // No 200 = endpoint está bajo guard. 401/403/503 son todos aceptables.
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);
      expect(res.status).not.toBe(204);
      // El cuerpo no debe contener PII del tenant.
      const text = JSON.stringify(res.body || {}).toLowerCase();
      expect(text).not.toContain('@gmail.com');
      expect(text).not.toContain('@hotmail.com');
    });
  });
});
