// =============================================================================
// test/security/postgres/pin-bypass.test.js
// =============================================================================
// Regression test del bypass P0 reportado en feedback FASE 1.A:
//
//   "Hoy un usuario con sesión PIN válida puede copiar el valor de ccb_staff
//    a una cookie contan2_staff y acceder a rutas STAFF."
//
// Flujo del test (integración real, no mock):
//
//   1. Login exitoso por POST /api/staff/login con el PIN seedado (4242)
//      → cookie `ccb_staff=<sid>` válida con sesión escrita en staff_sessions.
//   2. Validar que la sesión PIN funciona en su sitio legítimo
//      (GET /api/staff/me devuelve authenticated: true).
//   3. Intentar usarla como `ccb_staff` (la cookie original) para acceder a
//      endpoints del tier nuevo (STAFF/ADMIN/OWNER): TODOS deben rechazar
//      con 401/403.
//   4. Intentar el ataque del bypass: copiar el valor a una cookie
//      `contan2_staff` (alias deprecado que ya no debe existir). Los
//      mismos endpoints deben seguir rechazando.
//   5. Sanity: el scanner legacy sigue funcionando en /api/staff/me con la
//      cookie `ccb_staff` original.
//
// Endpoints cubiertos (corresponden al tier nuevo según matriz 05):
//   /api/users          /api/activities       /api/attendance
//   /api/dashboard      /api/insights         /api/uploads/image
// =============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, runIfPostgres, isPostgresAvailable } from '../../helpers/app.js';

const HOST = 'ccb.localhost';
const CCB_PIN = '4242';

function extractCookie(setCookie, name) {
  const list = Array.isArray(setCookie) ? setCookie : [setCookie].filter(Boolean);
  const found = list.find(c => new RegExp(`^${name}=`).test(c));
  return found ? found.split(';')[0] : null;
}

describe('postgres · PIN legacy NO atraviesa requireStaffSession', () => {
  let app;
  let pinCookie;      // `ccb_staff=<sid>` real, vivo en staff_sessions
  let pinSidValue;    // valor crudo del session id (lo que iría dentro de la cookie)

  beforeAll(async () => {
    if (!isPostgresAvailable()) return;
    app = await getTestApp();
    // 1) login real por /api/staff/login → cookie ccb_staff válida.
    const loginRes = await request(app)
      .post('/api/staff/login')
      .set('Host', HOST)
      .send({ pin: CCB_PIN });
    if (loginRes.status !== 200) {
      throw new Error(`login PIN falló: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    pinCookie = extractCookie(loginRes.headers['set-cookie'], 'ccb_staff');
    if (!pinCookie) throw new Error('login PIN no devolvió cookie ccb_staff');
    pinSidValue = pinCookie.replace(/^ccb_staff=/, '');
  });

  runIfPostgres('la sesión PIN funciona en su endpoint legítimo /api/staff/me', async () => {
    const res = await request(app)
      .get('/api/staff/me')
      .set('Host', HOST)
      .set('Cookie', pinCookie);
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
  });

  // Endpoints del tier nuevo. Cada uno debe rechazar la cookie PIN tanto en
  // su nombre original (ccb_staff) como en el alias deprecado (contan2_staff)
  // que motivó el bypass.
  const TIER_NEW_ENDPOINTS = [
    { method: 'get',  path: '/api/users' },
    { method: 'get',  path: '/api/activities' },
    { method: 'get',  path: '/api/attendance' },
    { method: 'get',  path: '/api/dashboard/stats' },
    { method: 'get',  path: '/api/insights/suggestions' },
    { method: 'post', path: '/api/uploads/image' },
  ];

  for (const { method, path } of TIER_NEW_ENDPOINTS) {
    runIfPostgres(`cookie ccb_staff válida → ${method.toUpperCase()} ${path} rechazado`, async () => {
      const res = await request(app)
        [method](path)
        .set('Host', HOST)
        .set('Cookie', `ccb_staff=${pinSidValue}`);
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);
      // El guard nuevo debe responder 401 (no autenticado en el tier nuevo).
      expect([401, 403]).toContain(res.status);
    });

    runIfPostgres(`alias bypass contan2_staff con SID real → ${method.toUpperCase()} ${path} rechazado`, async () => {
      // El vector del bypass: copiar el valor de ccb_staff a una cookie de
      // nombre contan2_staff. Con la fallback removida, debe seguir siendo
      // un 401/403 limpio.
      const res = await request(app)
        [method](path)
        .set('Host', HOST)
        .set('Cookie', `contan2_staff=${pinSidValue}`);
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);
      expect([401, 403]).toContain(res.status);
    });

    runIfPostgres(`combo ccb_staff + contan2_staff → ${method.toUpperCase()} ${path} rechazado`, async () => {
      // Caso real del navegador: el atacante setea AMBAS cookies (DevTools).
      const res = await request(app)
        [method](path)
        .set('Host', HOST)
        .set('Cookie', `ccb_staff=${pinSidValue}; contan2_staff=${pinSidValue}`);
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);
      expect([401, 403]).toContain(res.status);
    });
  }

  runIfPostgres('sanity · el scanner legacy NO se rompió en /api/staff/me', async () => {
    // Después del hardening, la cookie ccb_staff sigue válida en su namespace.
    const res = await request(app)
      .get('/api/staff/me')
      .set('Host', HOST)
      .set('Cookie', `ccb_staff=${pinSidValue}`);
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
  });
});
