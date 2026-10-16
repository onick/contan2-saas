// q2-publico/rsvp.spec.ts · RSVP-01 (token leido por SELECT en staging) y RSVP-02 (token invalido).
// Limite RSVP: 10/min por IP (spend 'rsvp'). RSVP-01 se salta si no hay E2E_SSH_HOST/E2E_SSH_KEY/E2E_DB_CONTAINER.
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { record } from '../../fixtures/data';
import { stagingSelect, stagingSqlConfigured } from '../../fixtures/staging-sql';
import { apiFor, jsonOf, type CreatedActivity } from '../../support/q3-api';
import { expectNoHorizontalOverflow } from '../../support/layout';
import { dropActivity, NO_STATE, note, q2Activity, q2Visitor, spend } from '../../support/q2-common';

const PROJECTS = ['webkit-tablet', 'desktop-1440', 'mobile-390'];

test.use({ storageState: NO_STATE });
test.describe.configure({ retries: 0 });

test.beforeEach(({}, testInfo) => {
  test.skip(!PROJECTS.includes(testInfo.project.name), 'rsvp: webkit-tablet, desktop-1440 y mobile-390');
  test.setTimeout(120_000);
});

// ===================================================================================================
// RSVP-02 · token invalido
// ===================================================================================================
const BAD_TOKENS: Array<{ label: string; token: string }> = [
  { label: 'hex de 48 que no existe', token: 'e2e0'.repeat(12) },
  { label: 'token corto', token: 'x' },
  { label: 'caracteres de inyeccion', token: "%27%20OR%201%3D1--" },
  { label: 'token larguisimo', token: 'a'.repeat(300) },
];

test('RSVP-02 token inválido: "Invitación no encontrada", sin fuga ni error 500 @smoke', { tag: '@smoke' }, async ({ page }) => {
  for (const { label, token } of BAD_TOKENS) {
    await spend('rsvp');
    const [apiRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/rsvp/api') && r.request().method() === 'GET'),
      page.goto(`/rsvp/${token}`),
    ]);
    expect(apiRes.status(), `GET /rsvp/api (${label})`).toBeLessThan(500);
    expect([400, 404], `estado para ${label}`).toContain(apiRes.status());
    await expect(page.getByText('Invitación no encontrada'), label).toBeVisible();
    const txt = await page.locator('body').innerText();
    expect(txt, `${label}: no debe haber trazas`).not.toMatch(/stack|undefined|\[object|SQL|exception|ECONN|at \w+\.\w+ \(/i);
    await expect(page.getByRole('button', { name: /Sí, voy|No puedo/ })).toHaveCount(0);
  }
  await expectNoHorizontalOverflow(page, '/rsvp inválido');
});

test('RSVP-02b responder con token inválido (POST) es rechazado sin crear nada', async ({ request }) => {
  await spend('rsvp', 2);
  const yes = await request.post('/rsvp/api', { data: { token: 'e2e0'.repeat(12), action: 'yes' } });
  expect([400, 404]).toContain(yes.status());
  const bogus = await request.post('/rsvp/api', { data: { token: 'e2e0'.repeat(12), action: 'quizas' } });
  expect(bogus.status()).toBeLessThan(500);
  expect([400, 404]).toContain(bogus.status());
  const bodyText = JSON.stringify(await jsonOf(yes));
  expect(bodyText).not.toMatch(/stack|SQL|exception/i);
});

test('RSVP-02c el aviso de invitación no encontrada y el error de respuesta están en tuteo', async ({ page }) => {
  await spend('rsvp');
  await page.goto(`/rsvp/${'e2e0'.repeat(12)}`);
  await expect(page.getByText('Invitación no encontrada')).toBeVisible();
  const txt = await page.locator('body').innerText();
  expect(txt).not.toMatch(/(?<![\p{L}])(Revisá|pedí|intentá|podés|acompañás|presentá)(?![\p{L}])/iu);
});

test('RSVP-02d la página de error es accesible: encabezado o rol de alerta', async ({ page }, testInfo) => {
  await spend('rsvp');
  await page.goto(`/rsvp/${'e2e0'.repeat(12)}`);
  await expect(page.getByText('Invitación no encontrada')).toBeVisible();
  const hasHeading = (await page.getByRole('heading').count()) > 0;
  const hasAlert = (await page.getByRole('alert').count()) > 0;
  if (!hasHeading && !hasAlert) {
    note(testInfo, 'RSVP-02', 'S3', 'el estado "Invitación no encontrada" no tiene encabezado ni role=alert/status (components/rsvp/RsvpClient.tsx): un lector de pantalla no lo anuncia');
  }
  // lang correcto
  expect(await page.evaluate(() => document.documentElement.lang)).toMatch(/^es/);
});

// ===================================================================================================
// RSVP-01 · token real (SELECT por SSH en staging)
// ===================================================================================================
test.describe('RSVP-01 con token real', () => {
  test.skip(!stagingSqlConfigured(), 'sin E2E_SSH_HOST/E2E_SSH_KEY/E2E_DB_CONTAINER: no se puede leer el token de la invitacion (el correo es dry-run y la API no lo devuelve)');

  let api: APIRequestContext;
  let act: CreatedActivity;

  test.beforeAll(async ({}, testInfo) => {
    test.setTimeout(240_000);
    api = await apiFor('owner');
    act = await q2Activity(api, `RSVP ${testInfo.project.name}`, { capacity: 10 });
  });
  test.afterAll(async () => {
    test.setTimeout(120_000);
    if (!api) return;
    await dropActivity(api, act.id);
    await api.dispose();
  });

  async function invite(slot: number, testName: string): Promise<{ token: string; firstName: string }> {
    const v = await q2Visitor(api, testName, 60 + slot, `RSVP ${slot}`);
    await spend('activity-write');
    const r = await api.post(`/app/actividades/api/${act.id}/invite-existing`, { data: { userIds: [v.id] } });
    expect(r.status(), 'invitar').toBe(201);
    const list = await jsonOf<{ invitations: Array<{ id: string; userId: string }> }>(await api.get(`/app/actividades/api/${act.id}/invitations`));
    const inv = list.invitations.find((i) => i.userId === v.id);
    expect(inv).toBeTruthy();
    record({
      kind: 'invitation',
      label: `invitacion rsvp ${slot} [E2E]`,
      id: inv!.id,
      cleanup: [{ method: 'POST', path: `/app/actividades/api/${act.id}/invitations/${inv!.id}/cancel` }],
    });
    if (!/^[0-9a-f-]{36}$/i.test(inv!.id)) throw new Error('id de invitacion inesperado');
    const rows = await stagingSelect(`select token from invitations where id = '${inv!.id}'`);
    const token = rows[0]?.[0];
    if (!token) throw new Error('no se pudo leer el token');
    return { token, firstName: v.firstName };
  }

  test('RSVP-01a confirmar: "¡Te esperamos!" y la invitación queda confirmada (idempotente)', async ({ page }, testInfo) => {
    const { token } = await invite(1, testInfo.project.name);
    await spend('rsvp', 4);
    await page.goto(`/rsvp/${token}?intent=yes`);
    await expect(page.getByRole('button', { name: 'Sí, voy' })).toBeFocused();
    await page.getByRole('button', { name: 'Sí, voy' }).click();
    await expect(page.getByText(/Te esperamos/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Te esperamos/)).toBeVisible(); // estado persistido, sin botones
    await expect(page.getByRole('button', { name: 'Sí, voy' })).toHaveCount(0);
  });

  test('RSVP-01b declinar: queda registrado y no ocupa cupo', async ({ page }, testInfo) => {
    const { token } = await invite(2, testInfo.project.name);
    await spend('rsvp', 3);
    await page.goto(`/rsvp/${token}?intent=no`);
    await page.getByRole('button', { name: 'No puedo' }).click();
    await expect(page.getByText(/Quedó registrado que no puedes asistir|no pued[eé]s asistir/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'No puedo' })).toHaveCount(0);
  });
});
