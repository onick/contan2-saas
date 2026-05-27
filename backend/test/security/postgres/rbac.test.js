// =============================================================================
// test/security/postgres/rbac.test.js
// =============================================================================
// Suite gated por `runIfPostgres`. Cuando DATABASE_URL + DB_DRIVER=postgres
// están seteados (CI o local con Postgres listo), valida RBAC positivo:
//
//   - operator → 403 en endpoints ADMIN/OWNER (DELETE actividad, PATCH branding,
//     orgDomain CRUD, credentials bulk-send, reports.xlsx).
//   - owner/admin → 200 en los mismos endpoints (camino feliz).
//   - cross-tenant → 403/404 (sesión de tenant A no opera sobre tenant B).
//   - cookie legacy `ccb_staff` → no autoriza endpoints del nuevo tier.
//
// Pre-requisitos para ejecutar (no se documentan dentro del helper porque la
// suite es opcional):
//
//   1. Postgres corriendo, DATABASE_URL apuntando a una DB de prueba aislada
//      (NO la de producción — usar dump scrubbed o instancia efímera).
//   2. Migraciones aplicadas (`npm run migrate` o equivalente).
//   3. Dos tenants seedados (`ccb`, `test-tenant`) con staff_members:
//        ccb-owner@test.local    role=owner     password=TestOwner!1234
//        ccb-admin@test.local    role=admin     password=TestAdmin!1234
//        ccb-operator@test.local role=operator  password=TestOperator!1234
//        t2-owner@test.local     role=owner    (tenant test-tenant)
//   4. Vars de entorno:
//        DB_DRIVER=postgres
//        DATABASE_URL=postgres://...
//        SECRET_BASE=... (para hashing de tokens)
//        ROOT_DOMAIN=localhost
//        PUBLIC_URL=http://localhost:3457
//
// El helper `runIfPostgres` ya devuelve `it.skip` si Postgres no está
// disponible — esta suite es CERO ruido cuando se corre la suite por defecto.
// =============================================================================

import { describe, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, runIfPostgres, isPostgresAvailable } from '../../helpers/app.js';

// Helper: login y devolver cookie de sesión + tenant host.
async function loginAs(app, { host, email, password }) {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Host', host)
    .send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login(${email}) → ${res.status}: ${JSON.stringify(res.body)}`);
  }
  // supertest expone cookies como array en res.headers['set-cookie']
  const cookies = res.headers['set-cookie'] || [];
  const sessionCookie = cookies.find((c) => /^contan2_session=/.test(c));
  if (!sessionCookie) throw new Error(`login(${email}): no se recibió cookie contan2_session`);
  return sessionCookie.split(';')[0]; // solo `name=value`, sin attrs
}

describe('postgres · RBAC operator vs admin/owner', () => {
  let app;
  let operatorCookie;
  let adminCookie;
  let ownerCookie;

  beforeAll(async () => {
    if (!isPostgresAvailable()) return;
    app = await getTestApp();
    operatorCookie = await loginAs(app, {
      host: 'ccb.localhost',
      email: 'ccb-operator@test.local',
      password: 'TestOperator!1234',
    });
    adminCookie = await loginAs(app, {
      host: 'ccb.localhost',
      email: 'ccb-admin@test.local',
      password: 'TestAdmin!1234',
    });
    ownerCookie = await loginAs(app, {
      host: 'ccb.localhost',
      email: 'ccb-owner@test.local',
      password: 'TestOwner!1234',
    });
  });

  runIfPostgres('operator NO puede DELETE actividad', async () => {
    const res = await request(app)
      .delete('/api/activities/some-id')
      .set('Host', 'ccb.localhost')
      .set('Cookie', operatorCookie);
    expect(res.status).toBe(403);
  });

  runIfPostgres('operator NO puede PATCH /api/org/branding', async () => {
    const res = await request(app)
      .patch('/api/org/branding')
      .set('Host', 'ccb.localhost')
      .set('Cookie', operatorCookie)
      .send({ primaryColor: '#abcdef' });
    expect(res.status).toBe(403);
  });

  runIfPostgres('operator NO puede GET /api/org/domain', async () => {
    const res = await request(app)
      .get('/api/org/domain')
      .set('Host', 'ccb.localhost')
      .set('Cookie', operatorCookie);
    expect(res.status).toBe(403);
  });

  runIfPostgres('operator NO puede POST /api/credentials/bulk-send', async () => {
    const res = await request(app)
      .post('/api/credentials/bulk-send')
      .set('Host', 'ccb.localhost')
      .set('Cookie', operatorCookie)
      .send({ codes: ['CCB-XXXXXX'] });
    expect(res.status).toBe(403);
  });

  runIfPostgres('operator NO puede descargar reports.xlsx', async () => {
    const res = await request(app)
      .get('/api/reports/period.xlsx?from=2026-01-01&to=2026-01-31')
      .set('Host', 'ccb.localhost')
      .set('Cookie', operatorCookie);
    expect(res.status).toBe(403);
  });

  runIfPostgres('admin SÍ puede GET /api/org/domain', async () => {
    const res = await request(app)
      .get('/api/org/domain')
      .set('Host', 'ccb.localhost')
      .set('Cookie', adminCookie);
    expect([200, 404]).toContain(res.status); // 404 si aún no hay dominio configurado
  });

  runIfPostgres('owner SÍ puede PATCH /api/org/branding', async () => {
    const res = await request(app)
      .patch('/api/org/branding')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .send({ primaryColor: '#111111' });
    // 200 ok, 400 si validación falla (color inválido) — pero no 401/403.
    expect([200, 400]).toContain(res.status);
  });
});

describe('postgres · cross-tenant isolation', () => {
  let app;
  let ccbOperatorCookie;

  beforeAll(async () => {
    if (!isPostgresAvailable()) return;
    app = await getTestApp();
    ccbOperatorCookie = await loginAs(app, {
      host: 'ccb.localhost',
      email: 'ccb-operator@test.local',
      password: 'TestOperator!1234',
    });
  });

  runIfPostgres('sesión de tenant A enviada con Host de tenant B → 401/403', async () => {
    // La sesión está bindeada a su tenant en el guard de requireStaffSession.
    // Cuando el Host resuelve a `test-tenant.localhost`, la sesión de ccb
    // no debe autorizar acceso a recursos de test-tenant.
    const res = await request(app)
      .get('/api/users')
      .set('Host', 'test-tenant.localhost')
      .set('Cookie', ccbOperatorCookie);
    expect([401, 403]).toContain(res.status);
  });

  runIfPostgres('GET /api/users solo devuelve usuarios del tenant del Host', async () => {
    // Camino feliz: ccb operator + Host ccb.localhost → solo usuarios del CCB.
    const res = await request(app)
      .get('/api/users')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ccbOperatorCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // No leaking de PII del otro tenant: si el seed pone @t2.local en
    // test-tenant, ninguno debe aparecer aquí.
    const text = JSON.stringify(res.body).toLowerCase();
    expect(text).not.toContain('@t2.local');
  });
});

describe('postgres · cookie legacy `ccb_staff` no autoriza tier nuevo', () => {
  let app;
  beforeAll(async () => {
    if (!isPostgresAvailable()) return;
    app = await getTestApp();
  });

  runIfPostgres('cookie ccb_staff falsa no abre PATCH /api/org/branding', async () => {
    const res = await request(app)
      .patch('/api/org/branding')
      .set('Host', 'ccb.localhost')
      .set('Cookie', 'ccb_staff=fake-legacy-pin')
      .send({ primaryColor: '#222222' });
    expect(res.status).not.toBe(200);
    expect([401, 403]).toContain(res.status);
  });

  runIfPostgres('cookie ccb_staff falsa no abre /api/org/domain', async () => {
    const res = await request(app)
      .get('/api/org/domain')
      .set('Host', 'ccb.localhost')
      .set('Cookie', 'ccb_staff=fake-legacy-pin');
    expect(res.status).not.toBe(200);
  });

  runIfPostgres('cookie ccb_staff falsa no abre credentials/bulk-send', async () => {
    const res = await request(app)
      .post('/api/credentials/bulk-send')
      .set('Host', 'ccb.localhost')
      .set('Cookie', 'ccb_staff=fake-legacy-pin')
      .send({ codes: ['CCB-XXXXXX'] });
    expect(res.status).not.toBe(200);
  });
});

describe('postgres · audit log de credential.sent', () => {
  let app;
  let adminCookie;

  beforeAll(async () => {
    if (!isPostgresAvailable()) return;
    app = await getTestApp();
    adminCookie = await loginAs(app, {
      host: 'ccb.localhost',
      email: 'ccb-admin@test.local',
      password: 'TestAdmin!1234',
    });
  });

  runIfPostgres('POST /api/credentials/:code/send deja audit log', async () => {
    // Disparar envío y luego consultar audit log a través del endpoint
    // administrativo (/api/audit-log) para verificar que el evento
    // `credential.sent` aparece.
    // El test no asume que el email se envió de verdad — solo que el audit
    // record se creó. En desarrollo Resend está mock-eado.
    const before = await request(app)
      .get('/api/audit-log')
      .set('Host', 'ccb.localhost')
      .set('Cookie', adminCookie);
    expect(before.status).toBe(200);
    const beforeCount = Array.isArray(before.body) ? before.body.length : (before.body.items?.length ?? 0);

    // El código tiene que existir en el seed.
    const sendRes = await request(app)
      .post('/api/credentials/CCB-OWN001/send')
      .set('Host', 'ccb.localhost')
      .set('Cookie', adminCookie)
      .send({});
    // 200/202 si Resend mock OK, 400/502 si email upstream falló — el audit
    // solo se escribe en el camino exitoso. Solo afirmamos audit cuando el
    // envío fue 2xx.
    if (sendRes.status >= 200 && sendRes.status < 300) {
      const after = await request(app)
        .get('/api/audit-log')
        .set('Host', 'ccb.localhost')
        .set('Cookie', adminCookie);
      const afterCount = Array.isArray(after.body) ? after.body.length : (after.body.items?.length ?? 0);
      expect(afterCount).toBeGreaterThan(beforeCount);
    }
  });
});
