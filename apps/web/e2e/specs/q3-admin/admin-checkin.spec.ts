// q3-admin/admin-checkin.spec.ts · ADM-08 consola /app/check-in (S0): registrar por codigo, "+1 sin credencial"
// con Idempotency-Key reutilizada en reintentos, doble clic = 1 asistencia, NewVisitorDrawer, acompanantes,
// cupo lleno y lista de invitados integrada. Rol owner, staging, datos [E2E].
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { e2eEmail, e2ePhone, tag } from '../../fixtures/data';
import {
  apiFor, cachedFixture, createActivity, createVisitor, jsonOf, trackVisitor,
  type CreatedActivity, type CreatedVisitor,
} from '../../support/q3-api';
import { settle, CODE_RE } from '../../support/q3-ui';
import { expectNoHorizontalOverflow } from '../../support/layout';

test.describe.configure({ mode: 'serial', retries: 0 });

let api: APIRequestContext;
let act: CreatedActivity;
let full: CreatedActivity;
let vA: CreatedVisitor; // registro identificado
let vB: CreatedVisitor; // doble clic
let vC: CreatedVisitor; // acompanantes
let vD: CreatedVisitor; // invitado (lista integrada)

test.beforeAll(async () => {
  api = await apiFor('owner');
  const fx = await cachedFixture('adm-checkin', async () => {
    const a = await createActivity(api, 'Consola check-in', { capacity: 40 });
    const f = await createActivity(api, 'Consola cupo lleno', { capacity: 1 });
    const a1 = await createVisitor(api, 31, 'Consola A');
    const b1 = await createVisitor(api, 32, 'Consola B');
    const c1 = await createVisitor(api, 33, 'Consola C');
    const d1 = await createVisitor(api, 34, 'Consola D');
    const inv = await api.post(`/app/actividades/api/${a.id}/invite-existing`, { data: { userIds: [d1.id] } });
    if (inv.status() !== 201) throw new Error(`invite-existing: HTTP ${inv.status()}`);
    return { a, f, a1, b1, c1, d1 };
  });
  act = fx.a; full = fx.f; vA = fx.a1; vB = fx.b1; vC = fx.c1; vD = fx.d1;
});
test.afterAll(async () => {
  await api?.dispose();
});

const attendanceOf = async (activityId: string, status = 'checked_in') =>
  (await jsonOf<{ items: Array<{ id: string; userCode: string | null; anonymous: boolean; companionsAdults: number; companionsChildren: number }>; total: number }>(
    await api.get(`/app/check-in/api/recent?activityId=${activityId}&status=${status}&limit=100`),
  ));

/** Tarjeta (li) de la actividad dentro de "Actividades activas". */
const card = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ hasText: name }).filter({ has: page.getByRole('button', { name: '+1 sin credencial' }) });

async function openConsole(page: Page) {
  await page.goto('/app/check-in');
  await settle(page);
  await expect(card(page, act.name)).toHaveCount(1);
}

async function pickVisitor(page: Page, v: CreatedVisitor) {
  const search = page.getByRole('searchbox', { name: /Buscar visitante/i });
  await search.fill(v.code);
  const hit = page.getByRole('button', { name: new RegExp(v.code) });
  await expect(hit).toBeVisible({ timeout: 10_000 });
  await hit.click();
  await expect(page.getByText(/Registrar a .* en/)).toBeVisible();
}

test.describe('ADM-08 · consola de check-in (S0)', () => {
  test('ADM-08a [S0] buscar por codigo -> actividad enfocada -> Registrar: 1 asistencia y toast', { tag: ['@write', '@smoke'] }, async ({ page }, testInfo) => {
    await openConsole(page);
    await pickVisitor(page, vA);
    // La actividad "enfocada" es la primera por fecha (puede haber otras activas): se registra en la tarjeta de ESTA actividad.
    const post = page.waitForResponse((r) => r.url().includes('/check-in/api/checkin') && r.request().method() === 'POST');
    await card(page, act.name).getByRole('button', { name: 'Registrar' }).click();
    expect((await post).status()).toBe(201);
    await expect(page.getByTestId('checkin-toast-success')).toContainText(/registrado en/);
    const att = await attendanceOf(act.id);
    expect(att.items.filter((i) => i.userCode === vA.code)).toHaveLength(1);
    if (testInfo.project.name !== 'mobile-390') await expectNoHorizontalOverflow(page, '/app/check-in');
    // El feed "Check-ins de hoy" lo lista.
    await expect(page.getByRole('heading', { name: 'Check-ins de hoy' })).toBeVisible();
  });

  test('ADM-08b [S0] doble clic en Registrar = UNA asistencia (idempotente en la consola)', { tag: '@write' }, async ({ page }) => {
    await openConsole(page);
    await pickVisitor(page, vB);
    let posts = 0;
    page.on('request', (r) => { if (r.url().includes('/check-in/api/checkin') && r.method() === 'POST') posts += 1; });
    await card(page, act.name).getByRole('button', { name: 'Registrar' }).dblclick();
    await expect(page.getByTestId(/checkin-toast-/)).toBeVisible();
    await settle(page);
    expect(posts, 'solo un POST sale del navegador').toBe(1);
    const att = await attendanceOf(act.id);
    expect(att.items.filter((i) => i.userCode === vB.code)).toHaveLength(1);
    // Reintento directo (otra pestana/otra persona): el servidor debe rechazar el duplicado, no sumar.
    const dup = await api.post('/app/check-in/api/checkin', { data: { activityId: act.id, visitor: { code: vB.code } } });
    expect([200, 409], 'duplicado: idempotente o 409').toContain(dup.status());
    expect((await attendanceOf(act.id)).items.filter((i) => i.userCode === vB.code)).toHaveLength(1);
  });

  test('ADM-08c [S0] "+1 sin credencial": Idempotency-Key reutilizada tras un fallo de red; doble clic = 1 ingreso', { tag: '@write' }, async ({ page }) => {
    await openConsole(page);
    const before = (await attendanceOf(act.id)).items.filter((i) => i.anonymous).length;
    const keys: string[] = [];
    let first = true;
    await page.route('**/check-in/api/anonymous', async (route) => {
      keys.push(route.request().headers()['idempotency-key'] ?? '');
      if (first) { first = false; return route.abort('connectionreset'); }
      return route.continue();
    });
    await card(page, act.name).getByRole('button', { name: '+1 sin credencial' }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar +1 sin credencial' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Sí, registrar +1' }).click();
    await expect(page.getByTestId('checkin-toast-error')).toBeVisible();
    await expect(dialog, 'el dialogo sigue abierto para reintentar').toBeVisible();
    await dialog.getByRole('button', { name: 'Sí, registrar +1' }).dblclick(); // reintento + doble clic
    await expect(page.getByTestId('checkin-toast-success')).toBeVisible();
    await settle(page);
    expect(keys.length, 'intento fallido + 1 reintento (el doble clic no dispara 2)').toBe(2);
    expect(keys[0], 'hay Idempotency-Key').toMatch(/^[0-9a-f-]{16,}$/i);
    expect(keys[1], 'el reintento reutiliza la MISMA key').toBe(keys[0]);
    const after = (await attendanceOf(act.id)).items.filter((i) => i.anonymous).length;
    expect(after - before, 'exactamente +1 ingreso anonimo').toBe(1);
  });

  test('ADM-08d [S0] Nuevo visitante: crea + registra en una operacion (NewVisitorDrawer)', { tag: '@write' }, async ({ page }) => {
    await openConsole(page);
    const first = tag('Consola NV');
    const email = e2eEmail('nv-1');
    await page.getByRole('button', { name: 'Nuevo visitante' }).click();
    const dialog = page.getByRole('dialog', { name: 'Crear y registrar' });
    await expect(dialog).toBeVisible();
    // validacion: sin nombre no envia
    await dialog.getByRole('button', { name: 'Crear y registrar' }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await dialog.getByLabel('Nombre').fill(first);
    await dialog.getByLabel('Apellido').fill('Prueba NV');
    await dialog.getByLabel(/Email/).fill(email);
    await dialog.getByLabel(/Teléfono/).fill(e2ePhone(41));
    const optValue = await dialog.getByRole('option').filter({ hasText: act.name }).first().getAttribute('value');
    await dialog.getByLabel('Actividad').selectOption(optValue as string);
    const post = page.waitForResponse((r) => r.url().includes('/check-in/api/checkin') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Crear y registrar' }).click();
    const res = await post;
    expect([200, 201]).toContain(res.status());
    const toast = page.getByTestId('checkin-toast-success');
    await expect(toast).toContainText(/creado y registrado/);
    const code = CODE_RE.exec((await toast.textContent()) ?? '')?.[0];
    expect(code, 'el toast informa el codigo').toBeTruthy();
    trackVisitor(code!, 'consola NV');
    const att = await attendanceOf(act.id);
    expect(att.items.some((i) => i.userCode === code)).toBe(true);
  });

  test('ADM-08e [S1] acompanantes: "Entraran N personas" y suman a la sala', { tag: '@write' }, async ({ page }) => {
    await openConsole(page);
    await pickVisitor(page, vC);
    await page.getByRole('button', { name: 'Más adultos' }).click();
    await page.getByRole('button', { name: 'Más niños' }).click();
    await expect(page.getByText('Entrarán 3 personas')).toBeVisible();
    const post = page.waitForResponse((r) => r.url().includes('/check-in/api/checkin') && r.request().method() === 'POST');
    await card(page, act.name).getByRole('button', { name: 'Registrar' }).click();
    expect((await post).status()).toBe(201);
    const row = (await attendanceOf(act.id)).items.find((i) => i.userCode === vC.code);
    expect(row?.companionsAdults).toBe(1);
    expect(row?.companionsChildren).toBe(1);
  });

  test('ADM-08f [S1] lista de invitados integrada en la tarjeta (sin seccion duplicada)', { tag: '@write' }, async ({ page }) => {
    await openConsole(page);
    const c = card(page, act.name);
    await expect(c).toContainText(/Lista de invitados: .*\d+.* de \d+ llegaron/);
    const gateway = c.getByRole('button', { name: /Invitados \d+\/\d+/ });
    await expect(gateway).toBeVisible();
    // Una sola tarjeta por actividad aunque tenga lista.
    await expect(card(page, act.name)).toHaveCount(1);
    await gateway.click();
    const drawer = page.getByRole('dialog').filter({ hasText: act.name });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(vD.firstName.slice(0, 15))).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('ADM-08g [S0] cupo lleno: Registrar deshabilitado y la API responde 409 (nunca confirma)', { tag: '@write' }, async ({ page }) => {
    const r1 = await api.post('/app/check-in/api/checkin', { data: { activityId: full.id, visitor: { code: vA.code } } });
    expect([200, 201]).toContain(r1.status());
    const r2 = await api.post('/app/check-in/api/checkin', { data: { activityId: full.id, visitor: { code: vB.code } } });
    expect(r2.status(), 'cupo lleno').toBe(409);
    expect((await jsonOf<{ error?: string }>(r2)).error ?? '').not.toBe('');
    const r3 = await api.post('/app/check-in/api/anonymous', { data: { activityId: full.id }, headers: { 'idempotency-key': `e2e-full-${Date.now()}` } });
    expect(r3.status(), '+1 anonimo con cupo lleno').toBe(409);
    await page.goto('/app/check-in');
    await settle(page);
    const c = card(page, full.name);
    await expect(c).toContainText('Lleno');
    await expect(c.getByRole('button', { name: '+1 sin credencial' })).toBeDisabled();
  });
});
