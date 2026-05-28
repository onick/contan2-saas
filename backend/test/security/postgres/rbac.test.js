// =============================================================================
// test/security/postgres/rbac.test.js
// =============================================================================
// Suite gated por `runIfPostgres`. Cuando DATABASE_URL + DB_DRIVER=postgres
// están seteados (CI o local con Postgres listo), valida:
//
//   - RBAC: operator → 403 en endpoints ADMIN/OWNER (DELETE/PUT actividad,
//     PATCH branding, orgDomain CRUD, credentials bulk-send, reports.xlsx).
//   - admin/owner → 2xx en los mismos endpoints (camino feliz).
//   - cross-tenant → 401/403 (sesión de tenant A no opera sobre tenant B).
//   - cross-tenant isolation: GET /api/users con sesión válida del CCB nunca
//     incluye usuarios de test-tenant.
//   - cookie legacy `ccb_staff` → no autoriza endpoints del nuevo tier.
//   - audit log: tras POST /api/credentials/:code/send con email MOCKEADO
//     determinístico, la entrada `credential.sent` aparece en /api/audit-log
//     con `targetId` correcto y organización correcta.
//
// Pre-requisitos (encapsulados en `make test-postgres`):
//   1. Postgres corriendo (docker-compose.test.yml o equivalente).
//   2. Migraciones aplicadas y seed-test-fixtures.mjs ejecutado.
//   3. Vars de entorno: DB_DRIVER=postgres, DATABASE_URL=..., SECRET_BASE=...,
//      ROOT_DOMAIN=localhost, PUBLIC_URL=http://localhost:3457.
//
// El email se mockea con `vi.mock('../../../src/services/email.js')` para que
// el endpoint /:code/send produzca SIEMPRE `{ sent: true, id: 'mock-id' }`,
// disparando determinísticamente el audit log y permitiendo aserciones
// sólidas sobre la entrada (action, targetId, tenant).
// =============================================================================

import { describe, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp, runIfPostgres, isPostgresAvailable } from '../../helpers/app.js';

// Mock del email service: hoisted por vitest antes de cualquier `import` de la
// app. Cualquier `await sendCredentialEmail(...)` devuelve un éxito determinista
// sin tocar Resend ni red.
vi.mock('../../../src/services/email.js', () => ({
  sendCredentialEmail: async () => ({ sent: true, id: 'mock-resend-id-123' }),
  sendReservationConfirmationEmail: async () => ({ sent: true, id: 'mock-rsvp-id' }),
  sendActivityCancellationEmail: async () => ({ sent: true, id: 'mock-cancel-id' }),
  sendInvitationEmail: async () => ({ sent: true, id: 'mock-invitation-id' }),
}));

// Switch global para forzar el fallo del INSERT del audit log dentro de
// la transacción del PATCH branding. `vi.hoisted` garantiza que la
// variable existe antes de que la fábrica del `vi.mock` se ejecute.
const auditFailControl = vi.hoisted(() => ({
  forceBrandingFail: false,
}));

// Mock del AuditLogRepository: delega al real, excepto cuando el flag
// está activo y el action es 'branding.updated' — entonces lanza para
// forzar el ROLLBACK del UPDATE en la transacción del handler. Mockear
// el repo directamente (en lugar del helper recordAudit) cubre la ruta
// real que toma el handler: `auditRepo.record(entry, client)` dentro de
// un BEGIN.
vi.mock('../../../src/db/postgres/platform/AuditLogRepository.js', async (importOriginal) => {
  const actual = await importOriginal();
  class WrappedAuditLogRepository extends actual.AuditLogRepository {
    async record(entry, client) {
      if (auditFailControl.forceBrandingFail && entry?.action === 'branding.updated') {
        throw new Error('forced audit insert failure for test');
      }
      return super.record(entry, client);
    }
  }
  return { ...actual, AuditLogRepository: WrappedAuditLogRepository };
});

// Defensa en profundidad: el flag forceBrandingFail se setea/resetea en un
// try/finally dentro de su test, así que NO es la causa del flake. Pero un
// afterEach global garantiza que ningún test futuro herede el flag en true
// si olvida el finally. Barato y a prueba de regresiones.
afterEach(() => {
  auditFailControl.forceBrandingFail = false;
});

// Helper: login y devolver cookie de sesión.
async function loginAs(app, { host, email, password }) {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Host', host)
    .send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login(${email}) → ${res.status}: ${JSON.stringify(res.body)}`);
  }
  const cookies = res.headers['set-cookie'] || [];
  const sessionCookie = cookies.find((c) => /^contan2_session=/.test(c));
  if (!sessionCookie) throw new Error(`login(${email}): no se recibió cookie contan2_session`);
  return sessionCookie.split(';')[0];
}

// IDs determinísticos del seed (ver scripts/seed-test-fixtures.mjs).
const CCB_ORG_ID = '00000000-0000-0000-0000-000000000001';
const T2_ORG_ID  = '00000000-0000-0000-0000-00000000000a';

describe('postgres · RBAC operator vs admin/owner', () => {
  let app;
  let operatorCookie;
  let adminCookie;
  let ownerCookie;
  let ccbActivityId;

  beforeAll(async () => {
    if (!isPostgresAvailable()) return;
    app = await getTestApp();

    // Sanity: el tenant CCB debe estar seeded en la DB. Si esto falla, el
    // resto de los asserts darían 404 (org no encontrada) en vez de 403/200.
    // Falla temprana con mensaje claro.
    const tenantRes = await request(app)
      .get('/api/_tenant')
      .set('Host', 'ccb.localhost');
    if (tenantRes.status !== 200 || tenantRes.body?.slug !== 'ccb') {
      throw new Error(
        `seed inconsistente: GET /api/_tenant (ccb.localhost) → ${tenantRes.status} ${JSON.stringify(tenantRes.body)}.\n` +
        'Esto causa 404 en cualquier ruta auth-gated. Verifica que docker-compose.test.yml está up y `node scripts/seed-test-fixtures.mjs` corrió ANTES de vitest.',
      );
    }

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
    // Capturar id de la actividad seedada para tests de PUT/DELETE.
    const listRes = await request(app)
      .get('/api/activities')
      .set('Host', 'ccb.localhost')
      .set('Cookie', adminCookie);
    ccbActivityId = listRes.body?.activities?.[0]?.id || null;
  });

  runIfPostgres('operator NO puede DELETE actividad real (403, no 404)', async () => {
    expect(ccbActivityId).toBeTruthy();
    const res = await request(app)
      .delete(`/api/activities/${ccbActivityId}`)
      .set('Host', 'ccb.localhost')
      .set('Cookie', operatorCookie);
    expect(res.status).toBe(403);
  });

  runIfPostgres('operator NO puede PUT actividad (estado/fecha/cupo)', async () => {
    expect(ccbActivityId).toBeTruthy();
    const res = await request(app)
      .put(`/api/activities/${ccbActivityId}`)
      .set('Host', 'ccb.localhost')
      .set('Cookie', operatorCookie)
      .send({
        name: 'Intento operator', type: 'cine',
        date: '2027-01-15T18:00:00Z', location: 'Sala A', capacity: 30,
        status: 'cancelada',
      });
    expect(res.status).toBe(403);
  });

  runIfPostgres('admin SÍ puede PUT actividad', async () => {
    expect(ccbActivityId).toBeTruthy();
    const res = await request(app)
      .put(`/api/activities/${ccbActivityId}`)
      .set('Host', 'ccb.localhost')
      .set('Cookie', adminCookie)
      .send({
        name: 'Actividad editada por admin', type: 'cine',
        date: '2027-02-20T18:00:00Z', location: 'Sala B', capacity: 60,
      });
    expect([200, 400]).toContain(res.status); // 200 ok, 400 si validación domain falla
    expect(res.status).not.toBe(403);
  });

  runIfPostgres('operator NO puede PATCH /api/org/branding', async () => {
    const res = await request(app)
      .patch('/api/org/branding')
      .set('Host', 'ccb.localhost')
      .set('Cookie', operatorCookie)
      .send({ primaryColor: '#abcdef' });
    // Aserción estricta. Si llega 404, es bug en resolveTenant (org no
    // encontrada) o middleware reordering — NO un problema de RBAC; el
    // diagnóstico de vitest mostrará el status real y el body.
    if (res.status !== 403) {
      throw new Error(
        `esperado 403 (RBAC), recibido ${res.status}. Body: ${JSON.stringify(res.body)}. ` +
        'Si es 404, el tenant no resolvió; revisar seed + Host. Si es 401, requireStaffSession no validó la cookie.',
      );
    }
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
      .send({ codes: ['CCB-OWN001'] });
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
    expect([200, 404]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  runIfPostgres('owner SÍ puede PATCH /api/org/branding', async () => {
    const res = await request(app)
      .patch('/api/org/branding')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .send({ primaryColor: '#111111' });
    expect([200, 400]).toContain(res.status);
    expect(res.status).not.toBe(403);
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
    const res = await request(app)
      .get('/api/users')
      .set('Host', 'test-tenant.localhost')
      .set('Cookie', ccbOperatorCookie);
    expect([401, 403]).toContain(res.status);
  });

  runIfPostgres('GET /api/users con Host del propio tenant solo devuelve usuarios de ese tenant', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ccbOperatorCookie);
    expect(res.status).toBe(200);
    // Shape real del endpoint: { users: [...], total: N }
    expect(Array.isArray(res.body.users)).toBe(true);
    // El visitante con email @test.local del CCB sí debe aparecer.
    const emails = res.body.users.map(u => (u.email || '').toLowerCase());
    // El visitante del test-tenant (seed-t2@test.local) NUNCA debe aparecer
    // en el listing de ccb.localhost.
    expect(emails).not.toContain('seed-t2@test.local');
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
      .send({ codes: ['CCB-OWN001'] });
    expect(res.status).not.toBe(200);
  });
});

describe('postgres · audit log de credential.sent (email mockeado)', () => {
  let app;
  let adminCookie;
  let ownUserId;

  beforeAll(async () => {
    if (!isPostgresAvailable()) return;
    app = await getTestApp();
    adminCookie = await loginAs(app, {
      host: 'ccb.localhost',
      email: 'ccb-admin@test.local',
      password: 'TestAdmin!1234',
    });
    // Obtener el id del usuario seed CCB-OWN001 — recordAudit usa user.id, no code.
    const userRes = await request(app)
      .get('/api/users/CCB-OWN001')
      .set('Host', 'ccb.localhost')
      .set('Cookie', adminCookie);
    expect(userRes.status).toBe(200);
    ownUserId = userRes.body?.id || null;
    expect(ownUserId).toBeTruthy();
  });

  runIfPostgres('POST /api/credentials/:code/send con email mockeado deja entrada exacta en audit', async () => {
    // 1. Snapshot del audit log (shape: { entries, nextCursor }) antes del envío.
    const before = await request(app)
      .get('/api/audit-log?action=credential.sent')
      .set('Host', 'ccb.localhost')
      .set('Cookie', adminCookie);
    expect(before.status).toBe(200);
    expect(Array.isArray(before.body.entries)).toBe(true);
    const beforeIds = new Set(before.body.entries.map(e => e.id));

    // 2. Disparar envío — sendCredentialEmail está mockeado a { sent: true }.
    const sendRes = await request(app)
      .post('/api/credentials/CCB-OWN001/send')
      .set('Host', 'ccb.localhost')
      .set('Cookie', adminCookie)
      .send({});
    // Con email mockeado, el handler entra al camino sent=true y devuelve
    // 200 con { ok: true }. Aserción dura (no condicional):
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.ok).toBe(true);
    expect(sendRes.body.id).toBe('mock-resend-id-123');

    // 3. Re-leer audit log: debe haber AL MENOS una entrada nueva con
    //    action=credential.sent, targetId=ownUserId, organization correcta.
    //
    //    NOTA: el handler escribe el audit de credential.sent fire-and-forget
    //    (`recordAudit(...).catch(() => {})` sin await en routes/credentials.js),
    //    así que el 200 puede volver ANTES de que el INSERT commitee. Hacemos
    //    poll corto (~2s) para tolerar esa consistencia eventual — sin esto el
    //    test es flaky (a veces lee 0 entradas nuevas). Si el equipo decide
    //    que el audit debe ser síncrono/durable antes del 200, eso es un cambio
    //    de runtime en credentials.js (PR aparte), no de este test.
    let credentialSent;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const after = await request(app)
        .get('/api/audit-log?action=credential.sent')
        .set('Host', 'ccb.localhost')
        .set('Cookie', adminCookie);
      expect(after.status).toBe(200);
      expect(Array.isArray(after.body.entries)).toBe(true);
      const newEntries = after.body.entries.filter(e => !beforeIds.has(e.id));
      credentialSent = newEntries.find(e => e.action === 'credential.sent');
      if (credentialSent) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    expect(
      credentialSent,
      'audit credential.sent no apareció en ~2s (fire-and-forget en el handler)',
    ).toBeDefined();
    expect(credentialSent.action).toBe('credential.sent');
    expect(credentialSent.targetId).toBe(ownUserId);
    expect(credentialSent.targetType).toBe('user');
    // organizationId queda implícito por el listing (el endpoint filtra
    // /api/audit-log por req.organization.id, que para ccb.localhost es
    // el UUID del CCB). Si por error apareciera una entrada de otro tenant,
    // este filter ya la habría excluido — pero verificamos también
    // explícitamente:
    expect(credentialSent.organizationId).toBe(CCB_ORG_ID);
    // metadata incluye resendId mockeado y email enmascarado.
    expect(credentialSent.metadata).toMatchObject({ resendId: 'mock-resend-id-123' });
  });

  runIfPostgres('audit log NO incluye entradas del otro tenant', async () => {
    // Sanity check: el listing visto desde ccb.localhost no debe contener
    // ninguna entrada con organizationId del test-tenant.
    const res = await request(app)
      .get('/api/audit-log?action=credential.sent')
      .set('Host', 'ccb.localhost')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const wrongTenant = res.body.entries.filter(e => e.organizationId === T2_ORG_ID);
    expect(wrongTenant.length).toBe(0);
  });
});

// ===========================================================================
// PATCH /api/org/branding · audit log
// ===========================================================================
// El runbook 06 (Paso 6.B.D corregido) usa este endpoint para reemplazar
// `logo_url` y `email_logo_url` durante la remediación de SVG históricos.
// Es identidad institucional del tenant — todo cambio queda auditado.
describe('postgres · audit log de branding.updated', () => {
  let app;
  let ownerCookie;

  beforeAll(async () => {
    if (!isPostgresAvailable()) return;
    app = await getTestApp();
    ownerCookie = await loginAs(app, {
      host: 'ccb.localhost',
      email: 'ccb-owner@test.local',
      password: 'TestOwner!1234',
    });
  });

  runIfPostgres('PATCH /api/org/branding deja entrada branding.updated con diff', async () => {
    // Snapshot ANTES.
    const before = await request(app)
      .get('/api/audit-log?action=branding.updated')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie);
    expect(before.status).toBe(200);
    expect(Array.isArray(before.body.entries)).toBe(true);
    const beforeIds = new Set(before.body.entries.map(e => e.id));

    // Cambio de primaryColor + logoUrl (campos que el runbook 6.B.D toca).
    const newLogo = '/uploads/audit-test-logo.png';
    const newColor = '#3a86ff';
    const patchRes = await request(app)
      .patch('/api/org/branding')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .send({ logoUrl: newLogo, primaryColor: newColor });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.ok).toBe(true);
    expect(patchRes.body.organization.logoUrl).toBe(newLogo);
    expect(patchRes.body.organization.primaryColor).toBe(newColor);

    // Snapshot DESPUÉS.
    const after = await request(app)
      .get('/api/audit-log?action=branding.updated')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie);
    expect(after.status).toBe(200);
    const newEntries = after.body.entries.filter(e => !beforeIds.has(e.id));
    expect(newEntries.length).toBeGreaterThan(0);

    const brandingEntry = newEntries.find(e => e.action === 'branding.updated');
    expect(brandingEntry).toBeDefined();
    expect(brandingEntry.targetType).toBe('organization');
    expect(brandingEntry.organizationId).toBe(CCB_ORG_ID);
    expect(brandingEntry.targetLabel).toBe('ccb');
    // metadata.fields lista los campos tocados; metadata.diff trae from/to.
    expect(brandingEntry.metadata.fields).toEqual(
      expect.arrayContaining(['logoUrl', 'primaryColor']),
    );
    expect(brandingEntry.metadata.diff.logoUrl).toMatchObject({ to: newLogo });
    expect(brandingEntry.metadata.diff.primaryColor).toMatchObject({ to: newColor });
  });

  runIfPostgres('PATCH con body vacío NO deja entrada (early return)', async () => {
    const before = await request(app)
      .get('/api/audit-log?action=branding.updated')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie);
    const beforeCount = before.body.entries.length;

    // Body vacío → el handler hace early return después del filtro de
    // diff real. Sin UPDATE, sin recordAudit.
    const res = await request(app)
      .patch('/api/org/branding')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.noop).toBe(true);

    const after = await request(app)
      .get('/api/audit-log?action=branding.updated')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie);
    expect(after.body.entries.length).toBe(beforeCount);
  });

  // === (b) Diff real: PATCH con valores idénticos a los actuales no audita ===
  runIfPostgres('PATCH con valores idénticos a los actuales NO deja entrada (diff real)', async () => {
    // El test anterior dejó logoUrl='/uploads/audit-test-logo.png' y
    // primaryColor='#3a86ff'. Re-PATCH con esos MISMOS valores no debe
    // tocar DB ni audit, porque el handler filtra fields donde
    // `from !== to` antes de hacer UPDATE.
    //
    // Para no depender del orden de tests, primero leemos el estado actual
    // con GET y luego re-PATCH con esos mismos valores. Funciona aunque el
    // test corra aislado.
    const current = await request(app)
      .get('/api/org/branding')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie);
    expect(current.status).toBe(200);

    const before = await request(app)
      .get('/api/audit-log?action=branding.updated')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie);
    const beforeCount = before.body.entries.length;

    const res = await request(app)
      .patch('/api/org/branding')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .send({
        logoUrl: current.body.logoUrl,
        emailLogoUrl: current.body.emailLogoUrl,
        primaryColor: current.body.primaryColor,
        secondaryColor: current.body.secondaryColor,
        sidebarStyle: current.body.sidebarStyle,
      });
    expect(res.status).toBe(200);
    expect(res.body.noop).toBe(true);

    const after = await request(app)
      .get('/api/audit-log?action=branding.updated')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie);
    expect(after.body.entries.length).toBe(beforeCount);
  });

  // === (c) Fallo de audit dispara ROLLBACK · branding NO cambia en DB ===
  runIfPostgres('fallo de insert audit revierte el UPDATE en la misma transacción', async () => {
    // Snapshot del estado completo de branding y del audit log antes
    // del intento. El test asserta:
    //   - status >= 500 (NO ok:true).
    //   - audit log NO crece (el INSERT que falló no commiteó).
    //   - branding en DB sigue IDÉNTICO al snapshot pre (el UPDATE
    //     se revirtió por el ROLLBACK).
    const orgBefore = await request(app)
      .get('/api/org/branding')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie);
    expect(orgBefore.status).toBe(200);
    const before = {
      logoUrl: orgBefore.body.logoUrl,
      emailLogoUrl: orgBefore.body.emailLogoUrl,
      primaryColor: orgBefore.body.primaryColor,
      secondaryColor: orgBefore.body.secondaryColor,
      sidebarStyle: orgBefore.body.sidebarStyle,
    };

    const auditBefore = await request(app)
      .get('/api/audit-log?action=branding.updated')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie);
    const auditBeforeCount = auditBefore.body.entries.length;

    // Color sentinela claramente distinto al actual, para que el handler
    // entre en la rama de UPDATE (no en el noop por diff vacío).
    const sentinel = before.primaryColor === '#deadbe' ? '#cafebe' : '#deadbe';

    auditFailControl.forceBrandingFail = true;
    let res;
    try {
      res = await request(app)
        .patch('/api/org/branding')
        .set('Host', 'ccb.localhost')
        .set('Cookie', ownerCookie)
        .send({ primaryColor: sentinel });
    } finally {
      auditFailControl.forceBrandingFail = false;
    }

    expect(res.status).not.toBe(200);
    expect(res.body?.ok).not.toBe(true);
    expect(res.status).toBeGreaterThanOrEqual(500);

    // audit log no creció.
    const auditAfter = await request(app)
      .get('/api/audit-log?action=branding.updated')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie);
    expect(auditAfter.body.entries.length).toBe(auditBeforeCount);

    // Branding en DB sigue idéntico al snapshot pre — el ROLLBACK
    // deshizo el UPDATE. Esto es lo que la transacción garantiza:
    // ni cambio aplicado ni audit faltante, todo o nada.
    const orgAfter = await request(app)
      .get('/api/org/branding')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie);
    expect(orgAfter.status).toBe(200);
    expect(orgAfter.body.primaryColor).toBe(before.primaryColor);
    expect(orgAfter.body.logoUrl).toBe(before.logoUrl);
    expect(orgAfter.body.emailLogoUrl).toBe(before.emailLogoUrl);
    expect(orgAfter.body.secondaryColor).toBe(before.secondaryColor);
    expect(orgAfter.body.sidebarStyle).toBe(before.sidebarStyle);
    // Crítico: NO debe haber tomado el sentinela.
    expect(orgAfter.body.primaryColor).not.toBe(sentinel);
  });
});
