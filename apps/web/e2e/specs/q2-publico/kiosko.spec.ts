// q2-publico/kiosko.spec.ts · KIO-01..KIO-10 (kiosko publico, sin login). webkit-tablet y desktop-1440.
// Datos: actividades "[E2E] <runId> Kiosko <proyecto> ..." y visitantes e2e+<runId>-<n>@test.local creados
// por el owner via API (support/q2-common). Los check-in reales respetan el limite de 10/min (spend).
// Hallazgos de producto confirmados se documentan con test.fail() (pasan "esperando el fallo"; si se
// arreglan el test avisa) o con annotations "hallazgo Sx".
import type { APIRequestContext, Page, TestInfo } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { runId, tag } from '../../fixtures/data';
import { apiFor, trackVisitor, type CreatedActivity, type CreatedVisitor } from '../../support/q3-api';
import { expectMinTarget, expectNoHorizontalOverflow } from '../../support/layout';
import {
  checkedIn, dropActivity, enrolledOf, escapeRe, NO_STATE, note, openKiosk, pickActivity, publicCheckin, q2Activity, q2Visitor, spend,
} from '../../support/q2-common';

const PROJECTS = ['webkit-tablet', 'desktop-1440'];

test.use({ storageState: NO_STATE });
test.describe.configure({ retries: 0 });

let api: APIRequestContext;
let proj = '';
let baseURL = '';
let MAIN: CreatedActivity; // cupo 3, adultos
let FULL: CreatedActivity; // cupo 1
let FLOW: CreatedActivity; // cupo 20, adultos (flujos de escritura)
let KIDS: CreatedActivity; // cupo 20, infantil
const visitors = new Map<number, CreatedVisitor>();

async function V(slot: number): Promise<CreatedVisitor> {
  let v = visitors.get(slot);
  if (!v) {
    v = await q2Visitor(api, proj, slot, `Kiosko ${slot}`);
    visitors.set(slot, v);
  }
  return v;
}

test.beforeAll(async ({}, testInfo) => {
  test.setTimeout(240_000); // el throttle de escrituras de actividades (10/min) espacia las altas
  proj = testInfo.project.name;
  baseURL = String(testInfo.project.use.baseURL);
  if (!PROJECTS.includes(proj)) return;
  api = await apiFor('owner');
  MAIN = await q2Activity(api, `Kiosko ${proj} MAIN`, { capacity: 3 });
  FULL = await q2Activity(api, `Kiosko ${proj} LLENA`, { capacity: 1 });
  FLOW = await q2Activity(api, `Kiosko ${proj} FLUJO`, { capacity: 20 });
  KIDS = await q2Activity(api, `Kiosko ${proj} NINOS`, { capacity: 20, audience: 'infantil' });
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  if (!api) return;
  // Cancelar saca las actividades de la cartelera publica y borrar las elimina. Con throttle propio:
  // las escrituras de actividades (30/min compartidos) se agotaban en el teardown global.
  for (const a of [MAIN, FULL, FLOW, KIDS]) {
    if (!a) continue;
    await dropActivity(api, a.id);
  }
  await api.dispose();
});

test.beforeEach(({}, testInfo) => {
  test.skip(!PROJECTS.includes(testInfo.project.name), 'kiosko: solo webkit-tablet y desktop-1440');
  test.setTimeout(150_000);
});

// -- helpers de UI ----------------------------------------------------------------------------------
const searchBox = (page: Page) => page.getByLabel(/Escribe tu nombre, correo o teléfono/);

async function toCodeScreen(page: Page, activity: CreatedActivity) {
  await openKiosk(page);
  await pickActivity(page, activity.name);
  await page.getByRole('button', { name: /Tengo mi código/ }).click();
  await page.getByTestId('kiosk-step-code').waitFor();
}

async function toNewScreen(page: Page, activity: CreatedActivity) {
  await openKiosk(page);
  await pickActivity(page, activity.name);
  await page.getByRole('button', { name: /Soy nuevo aquí/ }).click();
  await page.getByTestId('kiosk-step-new').waitFor();
}

/** Busca por codigo exacto y deja visible la tarjeta del visitante hallado. */
async function lookupByCode(page: Page, v: CreatedVisitor) {
  await spend('lookup', 2);
  await searchBox(page).fill(v.code);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('button', { name: 'Sí, confirmar asistencia' })).toBeVisible();
}

async function fillNew(page: Page, f: { first: string; last: string; email?: string; phone?: string }) {
  await page.getByLabel(/^Nombre/).fill(f.first);
  await page.getByLabel(/^Apellido/).fill(f.last);
  if (f.email) await page.getByLabel(/^Correo/).fill(f.email);
  if (f.phone) await page.getByLabel(/^Teléfono/).fill(f.phone);
}

/** Prefijo de email CON arroba (el endpoint decide "email" por la presencia de @). */
const emailPrefix = (v: CreatedVisitor) => v.email.slice(0, v.email.indexOf('@') + 3);

const DEMO_MARKERS = [/Vista previa/i, /CCB-7F3K2P/, /Cuenta-cuentos/i, /Los Congos de Villa Mella/i, /Código QR de demostración/i];
async function expectNoDemo(page: Page) {
  const text = await page.locator('body').innerText();
  for (const re of DEMO_MARKERS) expect(text, `dato demo visible: ${re}`).not.toMatch(re);
}

async function codeShown(page: Page): Promise<string> {
  const txt = (await page.getByTestId('kiosk-step-confirm').innerText()).replace(/\s+/g, ' ');
  const m = /\b([A-Z]{2,6}-[0-9A-Z]{6})\b/.exec(txt);
  if (!m) throw new Error('la confirmacion no muestra un codigo');
  return m[1]!;
}

// ===================================================================================================
// KIO-01 · bienvenida y lista
// ===================================================================================================
test('KIO-01 bienvenida y cartelera con la actividad [E2E] @smoke', { tag: '@smoke' }, async ({ page }) => {
  await openKiosk(page);
  await expect(page.getByRole('button', { name: 'Toca para registrarte' })).toBeVisible();
  await expect(page.getByText('Registro de visitantes')).toBeVisible();
  await expectNoDemo(page);
  await expectNoHorizontalOverflow(page, '/kiosko welcome');
  await expectMinTarget(page.getByRole('button', { name: 'Toca para registrarte' }), 44);

  await page.getByRole('button', { name: 'Toca para registrarte' }).click();
  await expect(page.getByRole('heading', { name: 'Elige tu actividad' })).toBeVisible();
  const card = page.getByRole('button', { name: new RegExp(escapeRe(MAIN.name)) });
  await expect(card).toBeVisible();
  await expect(card).toBeEnabled();
  await expect(card).toContainText('Cupos disponibles');
  await expect(card).toContainText('Sala E2E');
  await expect(card).toContainText(/Hoy/);
  await expectNoDemo(page);
  await expectNoHorizontalOverflow(page, '/kiosko actividades');
  await expectMinTarget(card, 44);
  // La actividad llena/cancelada no aparece (el listado publico filtra cupo y estado).
  await page.getByRole('button', { name: 'Volver al inicio' }).click();
  await expect(page.getByTestId('kiosk-step-welcome')).toBeVisible();
});

// ===================================================================================================
// KIO-02 · visitante por codigo -> confirmacion
// ===================================================================================================
test('KIO-02 visitante por código llega a la confirmación con su código @smoke @write', { tag: ['@smoke', '@write'] }, async ({ page }) => {
  const v = await V(1);
  await toCodeScreen(page, FLOW);
  await lookupByCode(page, v);
  await expect(page.getByText(v.code, { exact: false }).first()).toBeVisible();
  await spend('checkin');
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/kiosko/checkin') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Sí, confirmar asistencia' }).click(),
  ]);
  expect(res.status()).toBe(200);
  await expect(page.getByTestId('kiosk-step-confirm')).toBeVisible();
  await expect(page.getByRole('heading', { name: '¡Listo!' })).toBeVisible();
  expect(await codeShown(page), 'el codigo mostrado es el real del visitante (no se regenera)').toBe(v.code);
  await expect(page.getByRole('img', { name: `Código QR de ${v.code}` })).toBeVisible();
  await expect(page.getByText(/Visita número 1/)).toBeVisible();
  await expectNoDemo(page);
  const att = await checkedIn(api, FLOW.id);
  expect(att.items.map((i) => i.userCode)).toContain(v.code);
});

// ===================================================================================================
// KIO-03 · typeahead
// ===================================================================================================
test.describe('KIO-03 typeahead', () => {
  test('KIO-03a sugiere desde 3 caracteres, sin email/teléfono/id en la respuesta', async ({ page }, testInfo) => {
    const v = await V(2);
    await toCodeScreen(page, MAIN);
    await spend('lookup', 4);
    // <3 caracteres: no hay sugerencias
    await searchBox(page).fill(v.email.slice(0, 2));
    await page.waitForTimeout(700);
    await expect(page.getByText('¿Eres tú?')).toHaveCount(0);
    // >=3 caracteres: prefijo de email
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/kiosko/suggest')),
      searchBox(page).fill(emailPrefix(v)),
    ]);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { suggestions: Array<Record<string, unknown>> };
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.suggestions.length).toBeLessThanOrEqual(8);
    for (const s of body.suggestions) {
      const keys = Object.keys(s);
      for (const k of ['email', 'phone', 'id', 'userId', 'token']) expect(keys, `la respuesta publica no debe llevar ${k}`).not.toContain(k);
    }
    await expect(page.getByText('¿Eres tú?')).toBeVisible();
    // Estado de la UI: la sugerencia se ve entera (nombre completo + codigo completo) -> ver KIO-03b.
    const item = page.getByRole('button', { name: new RegExp(escapeRe(v.code)) });
    await expect(item).toBeVisible();
    note(testInfo, 'KIO-03', 'S1', 'la sugerencia pública muestra nombre completo y CÓDIGO completo (la credencial) a cualquiera que escriba 3 letras');
  });

  test('KIO-03b la sugerencia pública está enmascarada (sin apellido ni código completos)', async ({ page }) => {
    test.fail(true, 'BUG KIO-03 (S1): /public/users/suggest devuelve code+nombre+apellido completos; el code es la credencial del QR (apps/api-v2/src/routes/public.ts:283)');
    const v = await V(2);
    await toCodeScreen(page, MAIN);
    await spend('lookup', 2);
    await searchBox(page).fill(emailPrefix(v));
    await expect(page.getByText('¿Eres tú?')).toBeVisible();
    const panel = page.locator('div', { has: page.getByText('¿Eres tú?') }).last();
    const txt = await panel.innerText();
    expect(txt, 'codigo completo visible antes de identificarse').not.toContain(v.code);
    expect(txt, 'apellido completo visible antes de identificarse').not.toContain(v.lastName);
  });

  test('KIO-03c elegir una sugerencia con teclado (Tab + Enter) llega a la confirmación de datos', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit en macOS no enfoca <button> con Tab (ajuste del sistema); cubierto en chromium');
    const v = await V(2);
    await toCodeScreen(page, MAIN);
    await spend('lookup', 2);
    await searchBox(page).fill(emailPrefix(v));
    await expect(page.getByText('¿Eres tú?')).toBeVisible();
    await searchBox(page).focus();
    await page.keyboard.press('Tab'); // Buscar
    await page.keyboard.press('Tab'); // primera sugerencia
    await expect(page.getByRole('button', { name: new RegExp(escapeRe(v.code)) })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Sí, confirmar asistencia' })).toBeVisible();
  });

  test('KIO-03d el campo de búsqueda expone semántica combobox/listbox para lectores de pantalla', async ({ page }, testInfo) => {
    test.fail(true, 'BUG KIO-03 (S2 a11y): input sin role=combobox/aria-expanded/aria-controls ni lista role=listbox; sin aviso aria-live de resultados (components/kiosko/screens.tsx CodeScreen)');
    const v = await V(2);
    await toCodeScreen(page, MAIN);
    await spend('lookup', 2);
    await searchBox(page).fill(emailPrefix(v));
    await expect(page.getByText('¿Eres tú?')).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveCount(1);
    await expect(page.getByRole('listbox')).toHaveCount(1);
    void testInfo;
  });
});

// ===================================================================================================
// KIO-04 · visitante nuevo
// ===================================================================================================
test('KIO-04 visitante nuevo e2e+<runId>@test.local se registra y recibe su código @write', { tag: '@write' }, async ({ page }, testInfo) => {
  await toNewScreen(page, FLOW);
  const submit = page.getByRole('button', { name: /Registrarme y asistir/ });
  await expect(submit).toBeDisabled();
  // validaciones
  await fillNew(page, { first: 'A', last: 'B' });
  await expect(submit).toBeDisabled();
  await page.getByLabel(/^Correo/).fill('no-es-correo');
  await expect(page.getByText('Escribe un correo válido o déjalo en blanco.')).toBeVisible();
  await expect(submit).toBeDisabled();
  const email = `e2e+${runId().toLowerCase()}-kio04-${testInfo.project.name.slice(0, 3)}@test.local`;
  await fillNew(page, { first: tag(`Nuevo ${testInfo.project.name}`), last: 'Registro', email, phone: '809-555-0191' });
  await expect(submit).toBeEnabled();
  await expectNoHorizontalOverflow(page, '/kiosko nuevo');
  await spend('checkin');
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/kiosko/checkin') && r.request().method() === 'POST'),
    submit.click(),
  ]);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { code: string; visitCount: number; partySize: number };
  expect(body.code).toMatch(/^[A-Z]{2,6}-[0-9A-Z]{6}$/);
  expect(body.visitCount).toBe(1);
  trackVisitor(body.code, 'kiosko nuevo [E2E]');
  await expect(page.getByTestId('kiosk-step-confirm')).toBeVisible();
  await expect(page.getByText(/Te damos la bienvenida/)).toBeVisible();
  await expect(page.getByText('Tu primera visita')).toBeVisible();
  expect(await codeShown(page)).toBe(body.code);
  const att = await checkedIn(api, FLOW.id);
  expect(att.items.map((i) => i.userCode)).toContain(body.code);
});

// ===================================================================================================
// KIO-05 · acompanantes
// ===================================================================================================
test('KIO-05a actividad de adultos: acompañantes adultos, "Entrarán N personas" y cupo @write', { tag: '@write' }, async ({ page }, testInfo) => {
  await toNewScreen(page, FLOW);
  await expect(page.getByText('¿Vienes con acompañantes?')).toBeVisible();
  await expect(page.getByText('Adultos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Agregar adultos' }).click();
  await expect(page.getByText(/Entrarán\s+2 personas/)).toBeVisible();
  await page.getByRole('button', { name: 'Agregar adultos' }).click();
  await expect(page.getByText(/Entrarán\s+3 personas/)).toBeVisible();
  await expect(page.getByText(/tú \+ 2 acompañantes/)).toBeVisible();
  // tope de 6 y piso de 0
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Agregar adultos' }).click({ trial: false }).catch(() => {});
  await expect(page.getByRole('button', { name: 'Agregar adultos' })).toBeDisabled();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Quitar adultos' }).click();
  await expect(page.getByText(/Entrarán\s+3 personas/)).toBeVisible();

  const before = await enrolledOf(api, FLOW.id);
  const email = `e2e+${runId().toLowerCase()}-kio05a-${testInfo.project.name.slice(0, 3)}@test.local`;
  await fillNew(page, { first: tag(`Grupo ${testInfo.project.name}`), last: 'Adultos', email, phone: '809-555-0192' });
  await spend('checkin');
  const reqP = page.waitForRequest((r) => r.url().endsWith('/kiosko/checkin') && r.method() === 'POST');
  const resP = page.waitForResponse((r) => r.url().endsWith('/kiosko/checkin') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /Registrarme y asistir/ }).click();
  const sent = (await reqP).postDataJSON() as { companionsAdults: number; companionsChildren: number };
  expect(sent.companionsAdults).toBe(2);
  expect(sent.companionsChildren).toBe(0);
  const body = (await (await resP).json()) as { code: string; partySize: number };
  expect(body.partySize).toBe(3);
  trackVisitor(body.code, 'kiosko grupo adultos [E2E]');
  await expect(page.getByTestId('kiosk-step-confirm')).toBeVisible();
  await expect(page.getByText('Ocupa 3 cupos')).toBeVisible();
  await expect(page.getByText(/\+ 2 adultos/)).toBeVisible();
  const att = await checkedIn(api, FLOW.id);
  const mine = att.items.find((i) => i.userCode === body.code);
  expect(mine?.companionsAdults).toBe(2);
  const after = await enrolledOf(api, FLOW.id);
  if (before != null && after != null) expect(after - before, 'el grupo descuenta 3 cupos').toBe(3);
});

test('KIO-05b actividad infantil: acompañantes niños (por código) @write', { tag: '@write' }, async ({ page }) => {
  const v = await V(3);
  await toCodeScreen(page, KIDS);
  await lookupByCode(page, v);
  await expect(page.getByText('¿Vienes con niños?')).toBeVisible();
  await expect(page.getByText('Niños', { exact: true })).toBeVisible();
  await expect(page.getByText('Cada adulto debe registrarse por separado.')).toBeVisible();
  await page.getByRole('button', { name: 'Agregar niños' }).click();
  await expect(page.getByText(/Entrarán\s+2 personas/)).toBeVisible();
  await expect(page.getByText(/tú \+ 1 niño\b/)).toBeVisible();
  await spend('checkin');
  const reqP = page.waitForRequest((r) => r.url().endsWith('/kiosko/checkin') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Sí, confirmar asistencia' }).click();
  const sent = (await reqP).postDataJSON() as { companionsAdults: number; companionsChildren: number };
  expect(sent.companionsChildren).toBe(1);
  expect(sent.companionsAdults).toBe(0);
  await expect(page.getByTestId('kiosk-step-confirm')).toBeVisible();
  await expect(page.getByText('Ocupa 2 cupos')).toBeVisible();
  await expect(page.getByText(/\+ 1 niño/)).toBeVisible();
});

// ===================================================================================================
// KIO-06 · cupo lleno: nunca confirmacion (S0)
// ===================================================================================================
test('KIO-06a el grupo no cabe en el cupo restante: error y NUNCA confirmación @write', { tag: '@write' }, async ({ page }) => {
  const v = await V(4);
  await toCodeScreen(page, MAIN); // cupo 3
  await lookupByCode(page, v);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Agregar adultos' }).click(); // 1+3 = 4 > 3
  await expect(page.getByText(/Entrarán\s+4 personas/)).toBeVisible();
  await spend('checkin');
  await page.getByRole('button', { name: 'Sí, confirmar asistencia' }).click();
  await expect(page.getByTestId('kiosk-step-error')).toBeVisible();
  await expect(page.getByText('Se agotó el cupo de esta actividad.')).toBeVisible();
  await expect(page.getByTestId('kiosk-step-confirm')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Intentar de nuevo' })).toBeVisible();
  const att = await checkedIn(api, MAIN.id);
  expect(att.items.map((i) => i.userCode), 'no debe quedar asistencia').not.toContain(v.code);
  expect(await enrolledOf(api, MAIN.id)).toBe(0);
});

test('KIO-06b la actividad se llena mientras el visitante está en el flujo: error y sale de la cartelera @write', { tag: '@write' }, async ({ page }) => {
  const late = await V(5);
  const early = await V(6);
  await toCodeScreen(page, FULL); // cupo 1, visible al abrir
  // Otra persona ocupa el unico cupo (misma API publica que usa el kiosko).
  const taken = await publicCheckin(baseURL, { activityId: FULL.id, visitor: { code: early.code }, companionsChildren: 0, companionsAdults: 0 });
  expect(taken.status).toBe(200);
  await lookupByCode(page, late);
  await spend('checkin');
  await page.getByRole('button', { name: 'Sí, confirmar asistencia' }).click();
  await expect(page.getByTestId('kiosk-step-error')).toBeVisible();
  await expect(page.getByText('Se agotó el cupo de esta actividad.')).toBeVisible();
  await expect(page.getByTestId('kiosk-step-confirm')).toHaveCount(0);
  const att = await checkedIn(api, FULL.id);
  expect(att.items.map((i) => i.userCode)).toEqual([early.code]);
  expect(await enrolledOf(api, FULL.id)).toBe(1);
  // Reabrir: la actividad llena ya no se ofrece.
  await openKiosk(page);
  await page.getByRole('button', { name: 'Toca para registrarte' }).click();
  await page.getByTestId('kiosk-step-activity').waitFor();
  await expect(page.getByRole('button', { name: new RegExp(escapeRe(FULL.name)) })).toHaveCount(0);
});

// ===================================================================================================
// KIO-07 · duplicado idempotente
// ===================================================================================================
test('KIO-07a segundo check-in del mismo visitante: aviso claro y 1 sola asistencia @write', { tag: '@write' }, async ({ page }) => {
  const v = await V(7);
  const first = await publicCheckin(baseURL, { activityId: FLOW.id, visitor: { code: v.code }, companionsChildren: 0, companionsAdults: 0 });
  expect(first.status).toBe(200);
  const before = await enrolledOf(api, FLOW.id);
  await toCodeScreen(page, FLOW);
  await lookupByCode(page, v);
  await spend('checkin');
  await page.getByRole('button', { name: 'Sí, confirmar asistencia' }).click();
  await expect(page.getByTestId('kiosk-step-error')).toBeVisible();
  await expect(page.getByText('Ya tienes tu asistencia registrada en esta actividad.')).toBeVisible();
  await expect(page.getByTestId('kiosk-step-confirm')).toHaveCount(0);
  const att = await checkedIn(api, FLOW.id);
  expect(att.items.filter((i) => i.userCode === v.code)).toHaveLength(1);
  expect(await enrolledOf(api, FLOW.id), 'el duplicado no consume cupo').toBe(before);
});

test('KIO-07b doble toque en "Sí, confirmar" envía una sola petición @write', { tag: '@write' }, async ({ page }) => {
  const v = await V(8);
  await toCodeScreen(page, FLOW);
  await lookupByCode(page, v);
  await spend('checkin', 2); // margen por si el doble toque llegara a enviar dos
  let posts = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/kiosko/checkin') && r.method() === 'POST') posts += 1;
  });
  await page.getByRole('button', { name: 'Sí, confirmar asistencia' }).dblclick();
  await expect(page.getByTestId('kiosk-step-confirm').or(page.getByTestId('kiosk-step-error'))).toBeVisible();
  await page.waitForTimeout(500);
  expect(posts, 'peticiones POST /kiosko/checkin por doble toque').toBe(1);
  await expect(page.getByTestId('kiosk-step-confirm')).toBeVisible();
  const att = await checkedIn(api, FLOW.id);
  expect(att.items.filter((i) => i.userCode === v.code)).toHaveLength(1);
});

// ===================================================================================================
// KIO-08 · correo ya registrado
// ===================================================================================================
test('KIO-08 correo ya registrado: no crea duplicado y guía a identificarse con el código @write', { tag: '@write' }, async ({ page }) => {
  const existing = await V(9);
  await toNewScreen(page, FLOW);
  await fillNew(page, { first: tag('Duplicado correo'), last: 'Intento', email: existing.email.toUpperCase(), phone: '809-555-0193' });
  await spend('checkin');
  await page.getByRole('button', { name: /Registrarme y asistir/ }).click();
  await expect(page.getByTestId('kiosk-step-error')).toBeVisible();
  await expect(page.getByText('Ese correo ya está registrado. Identifícate con tu código.')).toBeVisible();
  await expect(page.getByTestId('kiosk-step-confirm')).toHaveCount(0);
  // "Intentar de nuevo" devuelve a la identificacion, donde esta "Tengo mi código".
  await page.getByRole('button', { name: 'Intentar de nuevo' }).click();
  await expect(page.getByTestId('kiosk-step-identify')).toBeVisible();
  await expect(page.getByRole('button', { name: /Tengo mi código/ })).toBeVisible();
  const att = await checkedIn(api, FLOW.id);
  expect(att.items.map((i) => i.userCode)).not.toContain(existing.code);
});

// ===================================================================================================
// KIO-09 · offline
// ===================================================================================================
test.describe('KIO-09 sin red', () => {
  test('KIO-09a check-in sin red: error con reintento y NUNCA datos demo @write', { tag: '@write' }, async ({ page }) => {
    const v = await V(10);
    await toCodeScreen(page, FLOW);
    await lookupByCode(page, v);
    await page.route('**/kiosko/checkin', (r) => r.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'Sí, confirmar asistencia' }).click();
    await expect(page.getByTestId('kiosk-step-error')).toBeVisible();
    await expect(page.getByText('No pudimos completar el registro. Intenta de nuevo.')).toBeVisible();
    await expect(page.getByTestId('kiosk-step-confirm')).toHaveCount(0);
    await expectNoDemo(page);
    expect((await checkedIn(api, FLOW.id)).items.map((i) => i.userCode), 'sin red no hay asistencia').not.toContain(v.code);
    // Reintento: vuelve la red y el visitante puede completar.
    await page.unroute('**/kiosko/checkin');
    await page.getByRole('button', { name: 'Intentar de nuevo' }).click();
    await expect(page.getByTestId('kiosk-step-identify')).toBeVisible();
    await page.getByRole('button', { name: /Tengo mi código/ }).click();
    await lookupByCode(page, v);
    await spend('checkin');
    await page.getByRole('button', { name: 'Sí, confirmar asistencia' }).click();
    await expect(page.getByTestId('kiosk-step-confirm')).toBeVisible();
  });

  test('KIO-09b búsqueda sin red: aviso honesto, sin resultado inventado', async ({ page }) => {
    const v = await V(11);
    await toCodeScreen(page, MAIN);
    await page.route('**/kiosko/lookup**', (r) => r.abort('internetdisconnected'));
    await page.route('**/kiosko/suggest**', (r) => r.abort('internetdisconnected'));
    await spend('lookup', 1);
    await searchBox(page).fill(v.code);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('No pudimos consultar el registro.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sí, confirmar asistencia' })).toHaveCount(0);
    await expectNoDemo(page);
  });

  test('KIO-09c el aviso de error de red está en tuteo (no voseo)', async ({ page }) => {
    test.fail(true, 'BUG H4 (S3): voseo "Revisá tu conexión e intentá de nuevo" en CodeScreen (components/kiosko/screens.tsx); el cliente es dominicano: tuteo');
    const v = await V(11);
    await toCodeScreen(page, MAIN);
    await page.route('**/kiosko/lookup**', (r) => r.abort('internetdisconnected'));
    await spend('lookup', 1);
    await searchBox(page).fill(v.code);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('No pudimos consultar el registro.')).toBeVisible();
    const txt = await page.getByTestId('kiosk-step-code').innerText();
    expect(txt).not.toMatch(/(?<![\p{L}])(Revisá|intentá|escribí|tocá|elegí|podés)(?![\p{L}])/iu);
  });
});

// ===================================================================================================
// KIO-10 · inactividad
// ===================================================================================================
test('KIO-10a tras la confirmación vuelve solo a la bienvenida y no deja datos @write', { tag: '@write' }, async ({ page }) => {
  const v = await V(12);
  await toCodeScreen(page, FLOW);
  await lookupByCode(page, v);
  await spend('checkin');
  await page.getByRole('button', { name: 'Sí, confirmar asistencia' }).click();
  await expect(page.getByTestId('kiosk-step-confirm')).toBeVisible();
  await expect(page.getByRole('button', { name: /Volver al inicio · \d+s/ })).toBeVisible();
  await expect(page.getByTestId('kiosk-step-welcome')).toBeVisible({ timeout: 22_000 });
  const text = await page.locator('body').innerText();
  expect(text).not.toContain(v.code);
  expect(text).not.toContain(v.firstName);
  // El siguiente visitante arranca limpio.
  await page.getByRole('button', { name: 'Toca para registrarte' }).click();
  await page.getByRole('button', { name: new RegExp(escapeRe(FLOW.name)) }).click();
  await page.getByRole('button', { name: /Tengo mi código/ }).click();
  await expect(searchBox(page)).toHaveValue('');
});

test('KIO-10b en pantallas intermedias, 10 min sin tocar vuelve a la bienvenida y borra lo tecleado', async ({ page }) => {
  test.fail(true, 'BUG KIO-10 (S1 privacidad): solo la confirmación tiene temporizador; en identificación/búsqueda/registro lo tecleado (nombre, correo, teléfono) queda en una tablet pública (app/kiosko/KioskClient.tsx)');
  await page.clock.install();
  await toNewScreen(page, MAIN);
  await page.getByLabel(/^Nombre/).fill('Persona Anterior');
  await page.getByLabel(/^Correo/).fill('anterior@test.local');
  await page.clock.fastForward('10:00');
  await expect(page.getByTestId('kiosk-step-welcome')).toBeVisible({ timeout: 3_000 });
  expect(await page.locator('body').innerText()).not.toContain('Persona Anterior');
});

// ===================================================================================================
// Responsive / targets del flujo
// ===================================================================================================
test('KIO-R pantallas del flujo sin overflow y con targets táctiles ≥44 px', async ({ page }) => {
  await openKiosk(page);
  await page.getByRole('button', { name: 'Toca para registrarte' }).click();
  await page.getByTestId('kiosk-step-activity').waitFor();
  await page.getByRole('button', { name: new RegExp(escapeRe(MAIN.name)) }).click();
  await page.getByTestId('kiosk-step-identify').waitFor();
  await expectNoHorizontalOverflow(page, 'identify');
  await expectMinTarget(page.getByRole('button', { name: /Tengo mi código/ }), 44);
  await expectMinTarget(page.getByRole('button', { name: /Soy nuevo aquí/ }), 44);
  await page.getByRole('button', { name: /Soy nuevo aquí/ }).click();
  await page.getByTestId('kiosk-step-new').waitFor();
  await expectNoHorizontalOverflow(page, 'nuevo');
  await expectMinTarget(page.getByRole('button', { name: 'Agregar adultos' }), 44);
  await expectMinTarget(page.getByRole('button', { name: /Registrarme y asistir/ }), 44);
  await page.getByRole('button', { name: 'Volver a identificación' }).click();
  await page.getByRole('button', { name: /Tengo mi código/ }).click();
  await expectNoHorizontalOverflow(page, 'codigo');
  await expectMinTarget(page.getByRole('button', { name: 'Buscar' }), 44);
});

// (evita warning de imports sin uso en builds estrictos)
export type _Unused = TestInfo;
