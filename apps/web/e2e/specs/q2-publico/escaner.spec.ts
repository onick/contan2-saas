// q2-publico/escaner.spec.ts · SCN-01..SCN-10 (escaner de puerta). webkit-tablet, desktop-1440 y mobile-390.
// Sesion: storageState `scanner` (un solo POST del PIN en global-setup, 12 h). El PIN real se usa SOLO en
// SCN-01/SCN-02 (webkit-tablet, y solo con Q2_RUN_PIN=1): limite 8/min por IP y maximo 4 intentos en toda la corrida.
// Camara simulada CONMUTABLE (support/q2-camera.ts) para no repetir el check-in cada 2.2 s.
import type { APIRequestContext, Page } from '@playwright/test';
import { request } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { denyCamera } from '../../fixtures/camera';
import { record } from '../../fixtures/data';
import { env } from '../../env';
import { apiFor, jsonOf, trackProtocol, type CreatedActivity, type CreatedVisitor } from '../../support/q3-api';
import { expectMinTarget, expectNoHorizontalOverflow } from '../../support/layout';
import { hideQr, installSwitchableCamera, showQr } from '../../support/q2-camera';
import {
  checkedIn, enrolledOf, escapeRe, NO_STATE, note, publicCheckin, q2Activity, q2Visitor, SCANNER_STATE, spend,
} from '../../support/q2-common';

const PROJECTS = ['webkit-tablet', 'desktop-1440', 'mobile-390'];
const CAMERA_DENIED_MSG = 'No pudimos acceder a la cámara. Revisa los permisos o usa la entrada manual.';

test.describe.configure({ retries: 0 });

let api: APIRequestContext;
let proj = '';
let baseURL = '';
let SC: CreatedActivity; // cupo 20: escaneos normales
let FULLS: CreatedActivity; // cupo 1
let PROT: CreatedActivity; // cupo 6: protocolo
const visitors = new Map<number, CreatedVisitor>();
// Slots del escaner (30+ para no chocar con los del kiosko, que comparte runId).
async function V(slot: number): Promise<CreatedVisitor> {
  let v = visitors.get(slot);
  if (!v) {
    v = await q2Visitor(api, proj, 30 + slot, `Escaner ${slot}`);
    visitors.set(slot, v);
  }
  return v;
}

test.beforeAll(async ({}, testInfo) => {
  proj = testInfo.project.name;
  baseURL = String(testInfo.project.use.baseURL);
  if (!PROJECTS.includes(proj)) return;
  api = await apiFor('owner');
  SC = await q2Activity(api, `Escaner ${proj} GENERAL`, { capacity: 20 });
  FULLS = await q2Activity(api, `Escaner ${proj} LLENA`, { capacity: 1 });
  PROT = await q2Activity(api, `Escaner ${proj} PROTOCOLO`, { capacity: 6 });
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  if (!api) return;
  for (const a of [SC, FULLS, PROT]) {
    if (!a) continue;
    await spend('activity-write', 2);
    await api.patch(`/app/actividades/api/${a.id}/status`, { data: { status: 'cancelada' } }).catch(() => {});
    await api.delete(`/app/actividades/api/${a.id}`).catch(() => {});
  }
  await api.dispose();
});

test.beforeEach(({}, testInfo) => {
  test.skip(!PROJECTS.includes(testInfo.project.name), 'escaner: webkit-tablet, desktop-1440 y mobile-390');
  test.setTimeout(150_000);
});

// -- helpers ----------------------------------------------------------------------------------------
async function openScanner(page: Page, activity: CreatedActivity) {
  await page.goto('/scanner');
  await expect(page.getByRole('heading', { name: '¿Qué vas a escanear?' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(escapeRe(activity.name)) }).click();
  await expect(page.getByLabel('Código manual')).toBeVisible();
}

const banner = (page: Page, kind: 'ok' | 'dup' | 'invalid' | 'full' | 'error') => page.getByTestId(`scanner-result-${kind}`);

async function manualEntry(page: Page, code: string) {
  await spend('checkin');
  await page.getByLabel('Código manual').fill(code);
  await page.getByRole('button', { name: 'Registrar' }).click();
}

function trackPageErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  return errs;
}

// ===================================================================================================
// SCN-01 / SCN-02 · PIN (maximo 4 intentos en toda la corrida)
// ===================================================================================================
test.describe('PIN del escáner', () => {
  test.use({ storageState: NO_STATE });
  const RUN_PIN = process.env.Q2_RUN_PIN === '1';

  test('SCN-01 PIN correcto: selector de actividad y cookie scanner_session segura', async ({ page, context }, testInfo) => {
    test.skip(!RUN_PIN, 'PIN real: solo con Q2_RUN_PIN=1 (limite de 4 intentos por corrida)');
    test.skip(testInfo.project.name !== 'webkit-tablet', 'el PIN se usa una sola vez por corrida (webkit-tablet)');
    const pin = env('E2E_SCANNER_PIN');
    test.skip(!pin, 'sin E2E_SCANNER_PIN');
    await page.goto('/scanner');
    await expect(page.getByRole('heading', { name: 'Ingresa el PIN de puerta' })).toBeVisible();
    const submit = page.getByRole('button', { name: 'Entrar' });
    await expect(submit).toBeDisabled(); // sin PIN no hay peticion
    await page.getByLabel('PIN del centro').fill('12ab');
    await expect(page.getByLabel('PIN del centro')).toHaveValue('12'); // solo digitos
    await page.getByLabel('PIN del centro').fill(pin);
    await spend('pin');
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/scanner/api/pin')), submit.click()]);
    await expect(page.getByRole('heading', { name: '¿Qué vas a escanear?' })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(escapeRe(SC.name)) })).toBeVisible();
    // Cookie: HttpOnly, Secure, SameSite, ~8 h. Sin imprimir el valor.
    const c = (await context.cookies()).find((k) => k.name === 'scanner_session');
    expect(c, 'cookie scanner_session').toBeTruthy();
    expect(c!.httpOnly, 'HttpOnly').toBe(true);
    expect(c!.secure, 'Secure').toBe(true);
    expect(['Lax', 'Strict']).toContain(c!.sameSite);
    const ttlH = (c!.expires - Date.now() / 1000) / 3600;
    expect(ttlH).toBeGreaterThan(7);
    expect(ttlH).toBeLessThanOrEqual(8.1);
    // La pagina recargada conserva la sesion (gate server-side).
    await page.reload();
    await expect(page.getByRole('heading', { name: '¿Qué vas a escanear?' })).toBeVisible();
    // El PIN no queda en el DOM ni en la URL.
    expect(page.url()).not.toContain(pin);
    expect(await page.content()).not.toContain(pin);
  });

  test('SCN-02 PIN incorrecto: mensaje claro, sin sesión', async ({ page, context }, testInfo) => {
    test.skip(!RUN_PIN, 'PIN real: solo con Q2_RUN_PIN=1 (limite de 4 intentos por corrida)');
    test.skip(testInfo.project.name !== 'webkit-tablet', 'el PIN se usa una sola vez por corrida (webkit-tablet)');
    const real = env('E2E_SCANNER_PIN');
    const wrong = real === '9731' ? '9732' : '9731';
    await page.goto('/scanner');
    await page.getByLabel('PIN del centro').fill(wrong);
    await spend('pin');
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/scanner/api/pin')), page.getByRole('button', { name: 'Entrar' }).click()]);
    await expect(page.getByRole('alert')).toContainText('PIN incorrecto');
    await expect(page.getByRole('heading', { name: 'Ingresa el PIN de puerta' })).toBeVisible();
    expect((await context.cookies()).some((k) => k.name === 'scanner_session')).toBe(false);
    // El mensaje no revela el PIN ni cuantos intentos quedan.
    expect(await page.getByRole('alert').innerText()).not.toMatch(/\d{4}/);
  });

  test('SCN-01b la pantalla de PIN es usable en este viewport (sin enviar PIN)', async ({ page }) => {
    await page.goto('/scanner');
    await expect(page.getByRole('heading', { name: 'Ingresa el PIN de puerta' })).toBeVisible();
    await expectNoHorizontalOverflow(page, '/scanner pin');
    await expectMinTarget(page.getByRole('button', { name: 'Entrar' }), 44);
    await expectMinTarget(page.getByLabel('PIN del centro'), 44);
  });
});

// ===================================================================================================
// Con sesion de escaner
// ===================================================================================================
test.describe('con sesión de escáner', () => {
  test.use({ storageState: SCANNER_STATE });

  test('SCN-03 QR válido con la cámara simulada: registra y muestra OK sin PII sobrante @write', { tag: '@write' }, async ({ page }) => {
    const v = await V(1);
    const errs = trackPageErrors(page);
    await installSwitchableCamera(page);
    await openScanner(page, SC);
    await spend('checkin');
    await showQr(page, v.code);
    const ok = banner(page, 'ok');
    await expect(ok).toBeVisible({ timeout: 15_000 });
    await hideQr(page);
    const txt = (await ok.innerText()).replace(/\s+/g, ' ');
    expect(txt).toContain(v.code);
    expect(txt).toMatch(/visita N\.º 1/);
    expect(txt, 'el banner no debe mostrar apellido, correo ni telefono').not.toContain(v.lastName);
    expect(txt).not.toContain(v.email);
    expect(txt).not.toContain(v.phone);
    expect(txt).not.toContain('@');
    await expect(ok).toHaveAttribute('role', 'status');
    expect((await checkedIn(api, SC.id)).items.map((i) => i.userCode)).toContain(v.code);
    expect(errs, 'errores de pagina').toEqual([]);
    // El banner se limpia solo.
    await expect(ok).toBeHidden({ timeout: 8_000 });
  });

  test('SCN-04 QR inválido (formato) y de otro centro (no existe): sin crash y con mensaje', async ({ page }) => {
    const errs = trackPageErrors(page);
    await installSwitchableCamera(page);
    await openScanner(page, SC);
    let posts = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/scanner/api/checkin') && r.method() === 'POST') posts += 1;
    });
    // 1) formato invalido: no sale ninguna peticion
    await showQr(page, 'ESTO-NO-ES-UN-PASE');
    await expect(banner(page, 'invalid')).toContainText('Código inválido', { timeout: 15_000 });
    await hideQr(page);
    expect(posts, 'un QR de formato invalido no debe llegar a la red').toBe(0);
    // 2) formato valido pero de otro centro / inexistente
    await page.waitForTimeout(2600); // cooldown de 2200 ms del lector
    await spend('checkin');
    await showQr(page, 'ZZZ-0E2E00');
    await expect(banner(page, 'invalid')).toContainText('Código no encontrado', { timeout: 15_000 });
    await hideQr(page);
    expect(posts).toBe(1);
    // La pantalla sigue operativa
    await expect(page.getByLabel('Código manual')).toBeVisible();
    expect(errs).toEqual([]);
  });

  test('SCN-05 mismo QR dos veces: segundo escaneo "Ya estaba registrado" y 1 sola asistencia @write', { tag: '@write' }, async ({ page }) => {
    const v = await V(2);
    await installSwitchableCamera(page);
    await openScanner(page, SC);
    await spend('checkin', 2);
    await showQr(page, v.code);
    await expect(banner(page, 'ok')).toBeVisible({ timeout: 15_000 });
    await hideQr(page);
    await page.waitForTimeout(2600);
    await showQr(page, v.code);
    const dup = banner(page, 'dup');
    await expect(dup).toBeVisible({ timeout: 15_000 });
    await expect(dup).toContainText('Ya estaba registrado');
    await hideQr(page);
    const att = await checkedIn(api, SC.id);
    expect(att.items.filter((i) => i.userCode === v.code)).toHaveLength(1);
  });

  test('SCN-06 cámara denegada: mensaje claro y la entrada manual sigue funcionando', async ({ page, context }) => {
    await denyCamera(page, context);
    await page.goto('/scanner');
    await page.getByRole('button', { name: new RegExp(escapeRe(SC.name)) }).click();
    await expect(page.getByText(CAMERA_DENIED_MSG)).toBeVisible();
    const manual = page.getByLabel('Código manual');
    await expect(manual).toBeVisible();
    await expect(manual).toBeEditable();
    // La entrada manual valida el formato sin red.
    await manual.fill('abc');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(banner(page, 'invalid')).toContainText('Código inválido');
    await expect(manual).toHaveValue('');
  });

  test('SCN-07 entrada manual registra al visitante (sin cámara) @smoke @write', { tag: ['@smoke', '@write'] }, async ({ page }) => {
    const v = await V(3);
    await installSwitchableCamera(page);
    await openScanner(page, SC);
    const submit = page.getByRole('button', { name: 'Registrar' });
    await expect(submit).toBeDisabled();
    await page.getByLabel('Código manual').fill(v.code.toLowerCase());
    await expect(page.getByLabel('Código manual')).toHaveValue(v.code); // el campo normaliza a mayusculas
    await spend('checkin');
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/scanner/api/checkin')), submit.click()]);
    const ok = banner(page, 'ok');
    await expect(ok).toBeVisible();
    await expect(ok).toContainText(v.code);
    await expect(ok, 'un visitante comun no lleva banner de protocolo').not.toContainText('Protocolo');
    await expect(page.getByLabel('Código manual')).toHaveValue('');
    expect((await checkedIn(api, SC.id)).items.map((i) => i.userCode)).toContain(v.code);
  });

  test('SCN-08 cupo lleno desde el escáner: "Cupo agotado" y nada se registra @write', { tag: '@write' }, async ({ page }) => {
    const first = await V(4);
    const late = await V(5);
    await installSwitchableCamera(page);
    await openScanner(page, FULLS); // con 0/1 aparece en la lista
    const taken = await publicCheckin(baseURL, { activityId: FULLS.id, visitor: { code: first.code }, companionsChildren: 0, companionsAdults: 0 });
    expect(taken.status).toBe(200);
    await manualEntry(page, late.code);
    const full = banner(page, 'full');
    await expect(full).toBeVisible();
    await expect(full).toContainText('Cupo agotado');
    await expect(banner(page, 'ok')).toHaveCount(0);
    expect((await checkedIn(api, FULLS.id)).items.map((i) => i.userCode)).toEqual([first.code]);
    expect(await enrolledOf(api, FULLS.id)).toBe(1);
  });

  test('SCN-09 salir limpia la sesión; una cookie inválida o vencida vuelve al PIN', async ({ page, context, baseURL: base }) => {
    const errs = trackPageErrors(page);
    await page.goto('/scanner');
    await expect(page.getByRole('heading', { name: '¿Qué vas a escanear?' })).toBeVisible();
    const before = (await context.cookies()).find((k) => k.name === 'scanner_session');
    expect(before, 'hay sesion cargada').toBeTruthy();
    const old = before!.value;
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.getByRole('heading', { name: 'Ingresa el PIN de puerta' })).toBeVisible();
    const after = (await context.cookies()).find((k) => k.name === 'scanner_session');
    expect(after, 'cookie borrada al salir').toBeFalsy();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ingresa el PIN de puerta' })).toBeVisible();

    // Cookie basura: el gate del servidor no la acepta.
    await context.addCookies([{ name: 'scanner_session', value: 'x.y.z', url: base! }]);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ingresa el PIN de puerta' })).toBeVisible();
    const me = await context.request.get('/scanner/api/me');
    expect(me.status()).toBe(401);

    // Reuso del token tras "Salir" (sesion sin estado en servidor): se documenta, no se imprime el valor.
    const ctx = await request.newContext({ baseURL: base!, extraHTTPHeaders: { cookie: `scanner_session=${old}` } });
    const replay = await ctx.get('/scanner/api/me');
    await ctx.dispose();
    if (replay.status() === 200) {
      test.info().annotations.push({ type: 'hallazgo S3', description: 'SCN-09: el token del escáner sigue válido tras "Salir" (cookie firmada sin revocación en servidor; vence a las 8 h)' });
      note(test.info(), 'SCN-09', 'S3', 'logout solo borra la cookie del navegador; el token firmado sigue válido hasta las 8 h (apps/api-v2/src/routes/scanner.ts /scanner/logout)');
    }
    expect(errs).toEqual([]);
  });

  test('SCN-10 invitado de protocolo con asiento reservado: banner "★ Protocolo" y +acompañantes @write', { tag: '@write' }, async ({ page }) => {
    const guest = await V(6);
    // Designar y reservar asiento (owner, API): categoria directivo, +1.
    await spend('activity-write', 2);
    const des = await api.post('/app/protocolo/api', { data: { userId: guest.id, category: 'directivo', honorific: 'Dr.' } });
    expect([200, 201]).toContain(des.status());
    trackProtocol(guest.id, 'protocolo scn-10 [E2E]');
    const inv = await api.post(`/app/actividades/api/${PROT.id}/protocol-invitations`, { data: { invites: [{ userId: guest.id, plusOnes: 1 }] } });
    expect(inv.status(), 'invitar protocolo').toBe(201);
    const list = await jsonOf<{ invitations: Array<{ id: string; userId: string }> }>(await api.get(`/app/actividades/api/${PROT.id}/invitations`));
    const mine = list.invitations.find((i) => i.userId === guest.id);
    expect(mine, 'invitacion creada').toBeTruthy();
    record({
      kind: 'invitation',
      label: 'invitacion protocolo scn-10 [E2E]',
      id: mine!.id,
      cleanup: [{ method: 'POST', path: `/app/actividades/api/${PROT.id}/invitations/${mine!.id}/cancel` }],
    });
    const heldBefore = await enrolledOf(api, PROT.id);
    expect(heldBefore, 'el asiento reservado (1+1) ya ocupa cupo').toBe(2);

    await installSwitchableCamera(page);
    await openScanner(page, PROT);
    await manualEntry(page, guest.code);
    const ok = banner(page, 'ok');
    await expect(ok).toBeVisible();
    const txt = (await ok.innerText()).replace(/\s+/g, ' ');
    expect(txt).toMatch(/★ Protocolo · Dr\./i); // el banner va en mayusculas por CSS
    expect(txt.toLowerCase()).toContain('+1 acompañantes');
    expect(txt).toContain('2 personas');
    // Llegada de una reserva: no vuelve a consumir cupo.
    expect(await enrolledOf(api, PROT.id)).toBe(2);
  });

  test('SCN-R pantallas del escáner sin overflow horizontal y con visor completo', async ({ page }) => {
    await installSwitchableCamera(page);
    await page.goto('/scanner');
    await expect(page.getByRole('heading', { name: '¿Qué vas a escanear?' })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'select');
    await page.getByRole('button', { name: new RegExp(escapeRe(SC.name)) }).click();
    await expect(page.getByLabel('Código manual')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'scan');
    await expect(page.locator('video')).toBeVisible();
    const box = await page.locator('video').boundingBox();
    const vw = page.viewportSize()!.width;
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw + 1);
  });

  test('SCN-T targets táctiles del escáner ≥44 px', async ({ page }, testInfo) => {
    await installSwitchableCamera(page);
    await page.goto('/scanner');
    const list: Array<[string, import('@playwright/test').Locator]> = [
      ['actividad', page.getByRole('button', { name: new RegExp(escapeRe(SC.name)) })],
      ['Salir', page.getByRole('button', { name: 'Salir' })],
    ];
    const violators: string[] = [];
    const measure = async (label: string, loc: import('@playwright/test').Locator) => {
      const b = await loc.boundingBox();
      if (!b || b.width < 44 || b.height < 44) violators.push(`${label} ${Math.round(b?.width ?? 0)}x${Math.round(b?.height ?? 0)}`);
    };
    for (const [l, loc] of list) await measure(l, loc);
    await page.getByRole('button', { name: new RegExp(escapeRe(SC.name)) }).click();
    await expect(page.getByLabel('Código manual')).toBeVisible();
    await measure('Registrar', page.getByRole('button', { name: 'Registrar' }));
    await measure('Código manual', page.getByLabel('Código manual'));
    await measure('Cerrar sesión', page.getByRole('button', { name: 'Cerrar sesión' }));
    await measure('← Actividad', page.getByRole('button', { name: /Actividad/ }));
    if (violators.length) note(testInfo, 'SCN-T', 'S3', `targets < 44 px: ${violators.join(', ')} (app/scanner/ScannerClient.tsx)`);
    expect(violators, 'targets tactiles bajo 44 px').toEqual([]);
  });
});
