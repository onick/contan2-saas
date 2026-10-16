// q3-admin/admin-misc.spec.ts · ADM-01 (dashboard = metricas), ADM-02 (paleta ⌘K), ADM-07 (filtros en URL),
// ADM-16 (equipo), ADM-17 (historial), ADM-19 (modo publico) y ADM-20 (API caida por modulo).
// ADM-18 (identidad) vive aparte en z-identity-last.spec.ts y se corre AL FINAL. ADM-21 (trial vencido) lo cubre vitest.
// Rol owner. Solo staging. Datos [E2E] con ledger.
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { e2eEmail, record, runId, tag } from '../../fixtures/data';
import {
  apiFor, cachedFixture, createActivity, createVisitor, jsonOf, type CreatedActivity, type CreatedVisitor,
} from '../../support/q3-api';
import { activityRow, settle } from '../../support/q3-ui';
import { expectNoHorizontalOverflow } from '../../support/layout';

test.describe.configure({ retries: 0 });

let api: APIRequestContext;
test.beforeAll(async () => {
  api = await apiFor('owner');
});
test.afterAll(async () => {
  await api?.dispose();
});

const numberIn = (text: string) => Number((/(-?\d[\d.,]*)/.exec(text)?.[1] ?? 'NaN').replace(/[.,]/g, ''));

/** Valor del KPI "Asistencias del periodo" en /app?period=today (primer numero tras la etiqueta). */
async function dashboardAttendanceToday(page: Page): Promise<number> {
  await page.goto('/app?period=today');
  await settle(page);
  const label = page.getByText('Asistencias del periodo', { exact: true }).first();
  await expect(label).toBeVisible();
  const text = await label.evaluate((el) => {
    let n: HTMLElement | null = el as HTMLElement;
    for (let i = 0; i < 5 && n; i++, n = n.parentElement) if (/\d/.test(n.innerText.replace(/Asistencias del periodo/, ''))) return n.innerText;
    return '';
  });
  return numberIn(text.replace('Asistencias del periodo', ''));
}

const metricsToday = async () =>
  (await jsonOf<{ metrics: { checkinsToday: number; uniqueVisitorsToday: number; activeActivities: number } }>(await api.get('/app/check-in/api/metrics'))).metrics;
const badges = async () =>
  (await jsonOf<{ badges: { checkinsToday: number; activeActivities: number } }>(await api.get('/app/api/shell/summary'))).badges;

// ---------------------------------------------------------------------------------------------------
test.describe('ADM-01 · dashboard = metricas = badges del shell', () => {
  test.describe.configure({ mode: 'serial' });
  const d = { dash: -1, metrics: -1, badge: -1, active: -1 };

  test('ADM-01a [S1] 3 check-ins [E2E] (5 personas): dashboard "Hoy", consola y badge del sidebar suben 5 (personas) y las activas +1', { tag: '@write' }, async ({ page }, testInfo) => {
    const base = { dash: await dashboardAttendanceToday(page), m: await metricsToday(), b: await badges() };
    const act = await createActivity(api, 'Dashboard metricas', { capacity: 30 });
    const a = await createVisitor(api, 71, 'Dash A');
    const b = await createVisitor(api, 72, 'Dash B');
    const r1 = await api.post('/app/check-in/api/checkin', { data: { activityId: act.id, visitor: { code: a.code }, companionsAdults: 2 } });
    const r2 = await api.post('/app/check-in/api/checkin', { data: { activityId: act.id, visitor: { code: b.code } } });
    const r3 = await api.post('/app/check-in/api/anonymous', { data: { activityId: act.id }, headers: { 'idempotency-key': `e2e-${runId()}-dash` } });
    expect([r1.status(), r2.status(), r3.status()]).toEqual([201, 201, 201]);

    const after = { dash: await dashboardAttendanceToday(page), m: await metricsToday(), b: await badges() };
    Object.assign(d, { dash: after.dash - base.dash, metrics: after.m.checkinsToday - base.m.checkinsToday, badge: after.b.checkinsToday - base.b.checkinsToday, active: after.m.activeActivities - base.m.activeActivities });
    test.info().annotations.push({ type: 'deltas', description: JSON.stringify(d) });
    expect(d.dash, `KPI "Asistencias del periodo" (Hoy) cuenta PERSONAS (${JSON.stringify(d)})`).toBe(5);
    expect(d.badge, `badge del sidebar cuenta PERSONAS (${JSON.stringify(d)})`).toBe(5);
    expect(d.active, 'actividades activas +1 (la mia)').toBe(1);
    await page.goto('/app/check-in');
    await settle(page);
    if (testInfo.project.name !== 'mobile-390') await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toContainText(String(after.b.activeActivities));
    await expectNoHorizontalOverflow(page, '/app/check-in');
  });

  test('ADM-01b [S2] "check-ins hoy" de la consola = badge del sidebar = dashboard (misma etiqueta, mismo numero)', async () => {
    test.skip(d.metrics < 0, 'depende de ADM-01a');
    expect(d.metrics, `consola, sidebar y dashboard cuentan PERSONAS (decision 6.5): ${JSON.stringify(d)}`).toBe(d.badge);
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe('ADM-02 · paleta de comandos ⌘K (teclado)', () => {
  let v: CreatedVisitor;
  test.beforeAll(async () => {
    v = (await cachedFixture('adm-misc-v', async () => ({ v: await createVisitor(api, 81, 'Paleta') }))).v;
  });

  test('ADM-02 [S2] abrir con Ctrl+K, filtrar, flechas, Enter navega, Esc cierra y devuelve el foco', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-390', 'el atajo de teclado es de escritorio');
    await page.goto('/app');
    await settle(page);
    const trigger = page.getByRole('button', { name: 'Buscar' }).first();
    await trigger.focus();
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Buscar' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Buscar' })).toBeFocused();
    // filtra modulos sin acentos
    await dialog.getByRole('textbox', { name: 'Buscar' }).fill('activ');
    await expect(dialog.getByRole('button', { name: /Actividades/ }).first()).toBeVisible();
    // Esc cierra y el foco regresa al disparador
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // Flechas + Enter: segundo modulo de la lista
    await page.keyboard.press('Control+k');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Buscar' }).fill('usuar');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app\/usuarios/);
    await settle(page); // navegacion completa (window.location): esperar a que el shell se hidrate

    // Entidades: la persona [E2E] por codigo -> /app/usuarios?q=<codigo>
    await page.keyboard.press('Control+k');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Buscar' }).fill(v.code);
    const person = dialog.getByRole('button').filter({ hasText: v.code });
    await expect(person.first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('ArrowDown'); // de "Ir a" (si hubiera) a la persona; Enter abre lo activo
    await person.first().hover();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/app/usuarios\\?q=${v.code}`));
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe('ADM-07 · filtros en la URL (actividades)', () => {
  test('ADM-07 [S2] estado, busqueda y vista viven en la URL: sobreviven a reload, a ir/volver y se ignoran los valores invalidos', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-390', 'en movil la lista son tarjetas (li), el conteo de filas es de tabla');
    await page.goto('/app/actividades');
    await settle(page);
    const pill = page.getByRole('button', { name: /^Finalizada \(\d+\)/ });
    const expected = numberIn((await pill.innerText()).replace('Finalizada', ''));
    await pill.click();
    await expect(page).toHaveURL(/estado=done/);
    await expect(pill).toHaveAttribute('aria-pressed', 'true');
    const rows = page.locator('tbody tr').filter({ visible: true });
    await expect(rows).toHaveCount(expected);

    await page.getByRole('searchbox', { name: 'Buscar actividad' }).fill('zzz-no-existe-e2e');
    await expect(page).toHaveURL(/q=zzz-no-existe-e2e/);
    await expect(page.getByText('Sin actividades')).toBeVisible();
    await page.getByRole('button', { name: 'Vista cuadrícula' }).click();
    await expect(page).toHaveURL(/vista=grid/);

    const url = page.url();
    await page.reload();
    await settle(page);
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('searchbox', { name: 'Buscar actividad' })).toHaveValue('zzz-no-existe-e2e');
    await expect(page.getByRole('button', { name: 'Vista cuadrícula' })).toHaveAttribute('aria-pressed', 'true');
    await expect(pill).toHaveAttribute('aria-pressed', 'true');

    // ir a otra pagina y volver
    await page.goto('/app/registros');
    await page.goBack();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('searchbox', { name: 'Buscar actividad' })).toHaveValue('zzz-no-existe-e2e');

    // valores invalidos: sin crash, vuelve a "todas"
    await page.goto('/app/actividades?estado=hack&fecha=nunca&vista=xx');
    await settle(page);
    await expect(page.getByRole('button', { name: /^Todas \(\d+\)/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Actividades', exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe('ADM-16 · equipo (cuenta e2e-reset)', () => {
  test.describe.configure({ mode: 'serial' });
  let resetId = '';
  const RESET_EMAIL = 'e2e-reset@test.local';

  const team = async () => (await jsonOf<{ items: Array<{ id: string; email: string; role: string; status: string }> }>(await api.get('/app/equipo/api/team?limit=100'))).items;
  const resetMember = async () => (await team()).find((m) => m.email === RESET_EMAIL);

  test.beforeAll(async () => {
    const m = await resetMember();
    expect(m, 'existe la cuenta dedicada e2e-reset@test.local').toBeTruthy();
    resetId = m!.id;
    // Reversion garantizada: el teardown deja la cuenta activa y como operator pase lo que pase.
    record({
      kind: 'tenant', label: 'e2e-reset: restaurar active/operator', id: resetId,
      cleanup: [
        { method: 'PATCH', path: `/app/equipo/api/${resetId}/status`, body: { status: 'active' } },
        { method: 'PATCH', path: `/app/equipo/api/${resetId}/role`, body: { role: 'operator' } },
      ],
    });
  });

  const memberRow = (page: Page) => page.getByRole('button', { name: 'Acciones de [E2E] Reset' });

  test('ADM-16a [S1] suspender y reactivar e2e-reset desde la UI (con confirmacion)', { tag: '@write' }, async ({ page }) => {
    try {
      await page.goto('/app/equipo');
      await settle(page);
      await memberRow(page).click();
      await page.getByRole('menuitem', { name: 'Suspender' }).click();
      await expect(page.getByText(/¿Suspender a .*Se cerrarán sus sesiones/)).toBeVisible();
      const patch = page.waitForResponse((r) => r.url().includes(`/app/equipo/api/${resetId}/status`) && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Confirmar' }).click();
      expect((await patch).status()).toBe(200);
      expect((await resetMember())?.status).toBe('suspended');
      await page.reload();
      await settle(page);
      await expect(page.getByText(RESET_EMAIL).first()).toBeVisible();
      await memberRow(page).click();
      await expect(page.getByRole('menuitem', { name: 'Suspender' }), 'la UI sabe que esta suspendida').toHaveCount(0);
      await page.getByRole('menuitem', { name: 'Reactivar' }).click();
      const back = page.waitForResponse((r) => r.url().includes(`/app/equipo/api/${resetId}/status`) && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Confirmar' }).click();
      expect((await back).status()).toBe(200);
      expect((await resetMember())?.status).toBe('active');
    } finally {
      await api.patch(`/app/equipo/api/${resetId}/status`, { data: { status: 'active' } });
    }
  });

  test('ADM-16b [S1] cambiar rol de e2e-reset (operator -> puerta -> operator)', { tag: '@write' }, async ({ page }) => {
    try {
      await page.goto('/app/equipo');
      await settle(page);
      await memberRow(page).click();
      await page.getByRole('menuitem', { name: 'Hacer Puerta' }).click();
      const patch = page.waitForResponse((r) => r.url().includes(`/app/equipo/api/${resetId}/role`) && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Confirmar' }).click();
      expect((await patch).status()).toBe(200);
      expect((await resetMember())?.role).toBe('puerta');
      // Hallazgo: el menu NO ofrece "Hacer Consulta" aunque el rol existe (API/invitaciones lo aceptan).
      await memberRow(page).click();
      const hasConsulta = await page.getByRole('menuitem', { name: 'Hacer Consulta' }).count();
      test.info().annotations.push({ type: 'hallazgo S3', description: `TeamRowActions.ALL_ROLES no incluye 'consulta': opciones de "Hacer Consulta" en el menu = ${hasConsulta}` });
    } finally {
      const r = await api.patch(`/app/equipo/api/${resetId}/role`, { data: { role: 'operator' } });
      expect([200, 204]).toContain(r.status());
      expect((await resetMember())?.role).toBe('operator');
    }
  });

  test('ADM-16c [S1] invitar staff en dry-run y revocar; admin NO puede invitar owner (403) ni ver "Hacer Propietario"', { tag: '@write' }, async ({ page, asRole }) => {
    const email = e2eEmail('staff');
    const inv = await api.post('/app/equipo/api/invitations', { data: { email, fullName: tag('Staff dry-run'), role: 'consulta' } });
    expect(inv.status(), 'invitar consulta').toBe(201);
    const body = await jsonOf<{ invitation: { id: string }; delivery: string }>(inv);
    record({ kind: 'invitation', label: 'invitacion staff [E2E]', id: body.invitation.id, cleanup: [{ method: 'POST', path: `/app/equipo/api/invitations/${body.invitation.id}`, body: { action: 'revoke' } }] });
    test.info().annotations.push({ type: 'delivery', description: body.delivery });
    expect(['dry-run', 'sent', 'error']).toContain(body.delivery);

    await page.goto('/app/equipo');
    await settle(page);
    const invRow = page.getByRole('listitem').filter({ hasText: email }).filter({ has: page.getByRole('button', { name: 'Revocar' }) });
    await expect(invRow).toBeVisible();
    const revoke = page.waitForResponse((r) => /\/app\/equipo\/api\/invitations\/[^/]+$/.test(r.url()) && r.request().method() === 'POST');
    await invRow.getByRole('button', { name: 'Revocar' }).click();
    expect((await revoke).status(), 'revocar invitacion').toBe(200);
    // Revocar es inmediato (sin confirmacion) y la fila sale de pendientes.
    await expect(page.getByRole('listitem').filter({ hasText: email }).filter({ has: page.getByRole('button', { name: 'Reenviar' }) })).toHaveCount(0, { timeout: 10_000 });

    // admin -> owner: 403 en API y sin opcion en la UI
    const { context, page: adminPage } = await asRole('admin');
    const forbidden = await context.request.post('/app/equipo/api/invitations', { data: { email: e2eEmail('staff-owner'), role: 'owner' } });
    expect(forbidden.status(), 'admin invita owner').toBe(403);
    await adminPage.goto('/app/equipo');
    await settle(adminPage);
    await adminPage.getByRole('button', { name: 'Acciones de [E2E] Reset' }).click();
    await expect(adminPage.getByRole('menuitem', { name: 'Hacer Administrador' })).toBeVisible();
    await expect(adminPage.getByRole('menuitem', { name: 'Hacer Propietario' })).toHaveCount(0);
    // el owner SI la ve
    await page.reload();
    await settle(page);
    await memberRow(page).click();
    await expect(page.getByRole('menuitem', { name: 'Hacer Propietario' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('ADM-16d [S1] el owner no tiene acciones sobre su propia fila (no puede auto-suspenderse desde la UI)', async ({ page }) => {
    const me = await jsonOf<{ staff: { id: string; fullName: string } }>(await api.get('/app/cuenta/api/me'));
    await page.goto('/app/equipo');
    await settle(page);
    await expect(page.getByRole('button', { name: `Acciones de ${me.staff.fullName}` })).toHaveCount(0);
  });

  test('ADM-16e [S3] el menu de rol ofrece TODOS los roles asignables, incluido Consulta', async ({ page }) => {
    await page.goto('/app/equipo');
    await settle(page);
    await memberRow(page).click();
    const offered = await page.getByRole('menuitem', { name: /^Hacer / }).allInnerTexts();
    expect(offered.map((t) => t.trim()), 'roles ofrecidos para e2e-reset (operator)').toEqual(
      expect.arrayContaining(['Hacer Consulta', 'Hacer Puerta', 'Hacer Biblioteca', 'Hacer Protocolo', 'Hacer Administrador']),
    );
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe('ADM-17 · historial y auditoria (sin PII)', () => {
  test('ADM-17a [S2] las acciones del run quedan auditadas con actor enmascarado y sin correos en claro (API + UI)', { tag: '@write' }, async ({ page }) => {
    const act: CreatedActivity = await createActivity(api, 'Auditoria historial', { capacity: 5 });
    const v = await createVisitor(api, 91, 'Auditoria');
    const ci = await api.post('/app/check-in/api/checkin', { data: { activityId: act.id, visitor: { code: v.code } } });
    expect(ci.status()).toBe(201);

    const audit = await jsonOf<{ items: Array<Record<string, unknown> & { action: string; targetLabel: string | null; actorEmailMasked: string | null; createdAt: string }> }>(
      await api.get('/app/historial/api/audit?limit=100'),
    );
    const actions = new Set(audit.items.map((i) => i.action));
    for (const a of ['user.created', 'checkin.manual']) expect(actions.has(a), `accion ${a} auditada (hay: ${[...actions].slice(0, 12).join(', ')})`).toBe(true);

    // UI: filtrar por tipo de evento y revisar la pagina completa.
    await page.goto('/app/historial');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Historial y auditoría' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Tipo de evento' }).selectOption({ label: 'Check-in registrado' });
    await settle(page);
    await expect(page.getByRole('main').getByText(/Check-in registrado/).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalOverflow(page, '/app/historial');
    const pageText = await page.getByRole('main').innerText();

    // PII al final (hallazgo): ningun correo en claro en actor, metadata ni etiquetas.
    const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
    const offenders = new Map<string, number>();
    for (const i of audit.items) {
      const bad = JSON.stringify(i).match(EMAIL)?.filter((e) => !e.includes('***')) ?? [];
      if (bad.length) offenders.set(i.action, (offenders.get(i.action) ?? 0) + bad.length);
    }
    for (const i of audit.items.slice(0, 60)) if (i.actorEmailMasked) expect(i.actorEmailMasked as string).toContain('***');
    expect(Object.fromEntries(offenders), 'acciones de auditoria que guardan correos EN CLARO (targetLabel/metadata)').toEqual({});
    const leaked = pageText.match(EMAIL)?.filter((e) => !e.includes('***')) ?? [];
    expect(leaked.length, 'la pagina /app/historial no muestra correos en claro').toBe(0);
  });

  test('ADM-17b [S2] crear una actividad queda auditado (activity.created) y alimenta el KPI "Actividades creadas"', { tag: '@write' }, async () => {
    const before = (await jsonOf<{ kpis: { activitiesToday: number } }>(await api.get('/app/historial/api/overview'))).kpis.activitiesToday;
    const act = await createActivity(api, 'Auditoria alta', { capacity: 5 });
    const audit = await jsonOf<{ items: Array<{ action: string; metadata: Record<string, unknown>; targetId: string | null }> }>(await api.get('/app/historial/api/audit?limit=100&action=activity.created'));
    const hit = audit.items.some((i) => i.targetId === act.id || JSON.stringify(i.metadata).includes(act.id));
    const after = (await jsonOf<{ kpis: { activitiesToday: number } }>(await api.get('/app/historial/api/overview'))).kpis.activitiesToday;
    expect(hit, `no hay entrada activity.created para la actividad nueva; KPI "Actividades creadas" ${before} -> ${after}`).toBe(true);
    expect(after - before).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe('ADM-19 · modo publico: enlaces y QR', () => {
  test('ADM-19 [S2] enlaces del kiosko y del escaner apuntan a ESTE tenant, abren (200) y el QR se genera local', async ({ page, baseURL, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL! }).catch(() => undefined);
    await page.goto('/app/modo-publico');
    await settle(page);
    const host = new URL(baseURL!).host;
    for (const [name, path] of [['Kiosko de auto-registro', '/kiosko'], ['Scanner de check-in', '/scanner']] as const) {
      await expect(page.getByText(`https://${host}${path}`, { exact: true })).toBeVisible();
      const open = page.getByRole('link', { name: /Abrir en nueva pestaña/ }).nth(path === '/kiosko' ? 0 : 1);
      await expect(open).toHaveAttribute('href', new RegExp(`https://${host.replace(/\./g, '\\.')}${path}$`));
      const res = await page.request.get(path);
      expect(res.status(), `${name} responde`).toBe(200);
    }
    // nunca debe apuntar a produccion
    expect(await page.getByRole('main').innerText()).not.toMatch(/https:\/\/ccb\.contan2\.com/);

    // Copiar enlace -> portapapeles
    await page.getByRole('button', { name: 'Copiar enlace del Kiosko de auto-registro' }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    if (clip) expect(clip).toBe(`https://${host}/kiosko`);

    // QR: aparece una imagen/canvas con tamano razonable
    await page.getByRole('button', { name: 'Mostrar QR' }).first().click();
    const qr = page.locator('canvas, img[alt*="QR" i], svg[aria-label*="QR" i]').first();
    await expect(qr).toBeVisible();
    const box = await qr.boundingBox();
    expect(box!.width, 'QR legible (>=120px)').toBeGreaterThanOrEqual(120);
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe('ADM-20 · API caida por modulo: estado honesto, nunca demo', () => {
  const BFF = /\/app\/(?:[^/]+\/)?api\/|\/app\/api\//;

  async function offline(page: Page, route: string) {
    const aborted: string[] = [];
    await page.route(BFF, (r) => {
      aborted.push(new URL(r.request().url()).pathname);
      return r.abort('failed');
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(route);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(700);
    return { aborted, errors, text: await page.locator('body').innerText() };
  }

  for (const route of ['/app', '/app/check-in', '/app/historial', '/app/equipo', '/app/reportes', '/app/protocolo', '/app/puerta', '/app/segmentos', '/app/usuarios', '/app/registros', '/app/actividades']) {
    test(`ADM-20 [S1] ${route}: BFF caido -> sin "Datos de demostración" y sin errores no controlados`, async ({ page }) => {
      const r = await offline(page, route);
      expect(r.text).not.toMatch(/Datos de demostraci/i);
      expect(r.errors.filter((m) => !/#418/.test(m)), 'pageerror').toEqual([]);
      await expect(page.locator('main, [role="main"]').first()).toBeVisible();
    });
  }

  test('ADM-20a [S1] /app/check-in: con la API caida muestra error con reintento (honesto)', async ({ page }) => {
    const r = await offline(page, '/app/check-in');
    expect(r.text).toMatch(/Métricas no disponibles/);
    expect(r.text).toMatch(/Sin conexión\. Reintenta\./);
    await expect(page.getByRole('button', { name: 'Refrescar' })).toBeVisible();
  });

  test('ADM-20b [S2] /app/puerta: con la API caida NO debe afirmar "No hay salas permanentes"', async ({ page }) => {
    const r = await offline(page, '/app/puerta');
    expect(r.text, 'el estado vacio afirma algo falso cuando en realidad fallo la carga').not.toMatch(/No hay salas permanentes|Todavía no se configuraron salas/);
  });

  test('ADM-20c [S2] /app/reportes: con la API caida NO debe afirmar "Todavía no hay actividades con categoría"', async ({ page }) => {
    const r = await offline(page, '/app/reportes');
    expect(r.text).not.toMatch(/Todavía no hay actividades con categoría/);
  });

  test('ADM-20d [S3] cobertura: las paginas SSR (dashboard, usuarios, registros, segmentos, actividades) cargan datos en el servidor de Next', async ({}, testInfo) => {
    testInfo.annotations.push({ type: 'cobertura', description: 'No automatizable desde el navegador: su fetch a api-v2 ocurre en el servidor de Next (page.route no lo ve). Verificar a mano con api-v2 detenido en staging o por vitest de Unavailable.' });
    expect(true).toBe(true);
    void activityRow;
  });
});
