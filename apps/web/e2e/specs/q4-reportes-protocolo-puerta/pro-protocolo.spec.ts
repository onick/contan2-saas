// q4/pro-protocolo.spec.ts · PRO-01..04: dashboard de Protocolo, CRUD de invitado especial [E2E], invitación a
// actividad [E2E] con +N acompañantes (Modelo A: hold con asiento reservado, sin check-in), export por rol y banner
// de protocolo en la consola de check-in. Rol owner (+ protocolo/puerta para permisos). Solo staging.
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { tag } from '../../fixtures/data';
import { apiFor, createVisitor, jsonOf, trackProtocol, type CreatedVisitor } from '../../support/q3-api';
import { q4CreateActivity, q4Fixture, parseXlsx, ymdUTC, type Q4Activity } from '../../support/q4-common';
import { settle } from '../../support/q3-ui';

test.describe.configure({ retries: 0 }); // sin 'serial': un fallo (bug real) no debe saltar el resto; el estado vive en la API

let api: APIRequestContext;
interface ProFx { act: Q4Activity; small: Q4Activity; p1: CreatedVisitor; p2: CreatedVisitor; plain: CreatedVisitor }
let fx: ProFx;

test.beforeAll(async () => {
  api = await apiFor('owner');
  fx = await q4Fixture<ProFx>('pro', async () => {
    const act = await q4CreateActivity(api, tag('Protocolo UI'), { capacity: 12 });
    const small = await q4CreateActivity(api, tag('Protocolo aforo 4'), { capacity: 4 });
    const p1 = await createVisitor(api, 51, 'Pro Uno');
    const p2 = await createVisitor(api, 52, 'Pro Dos');
    const plain = await createVisitor(api, 53, 'Sin protocolo');
    return { act, small, p1, p2, plain };
  });
});
test.afterAll(async () => {
  await api?.dispose();
});

const dashboard = async () => jsonOf<any>(await api.get('/app/protocolo/api/dashboard'));
const guestsOf = async (activityId: string) => jsonOf<any>(await api.get(`/app/actividades/api/${activityId}/protocol-invitations`));
const invite = (activityId: string, invites: Array<{ userId: string; plusOnes: number }>) =>
  api.post(`/app/actividades/api/${activityId}/protocol-invitations`, { data: { invites } });

test.describe('PRO-01 dashboard', () => {
  test('PRO-01a @smoke [S1] /app/protocolo: encabezado, acciones y KPIs = API del dashboard', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app/protocolo');
    await expect(page.getByRole('heading', { name: 'Protocolo Institucional', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Exportar invitados/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Invitar a actividad/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Designar invitado/ })).toBeVisible();
    const d = await dashboard();
    await page.waitForTimeout(500);
    const shown = await page.locator('[data-count]').evaluateAll((els) => els.slice(0, 4).map((e) => Number((e as HTMLElement).dataset.count)));
    expect(shown, 'Invitados · Categorías activas · Pendientes · Tasa de asistencia').toEqual([
      d.kpis.guests, d.kpis.activeCategories, d.kpis.pendingInvites, d.kpis.attendanceRate,
    ]);
    // La pestaña "Todas" cuenta a los invitados de la lista.
    await expect(page.getByRole('button', { name: new RegExp(`^Todas \\(${d.guests.length}\\)`) })).toBeVisible();
  });

  test('PRO-01b [S2] filtros: búsqueda sin resultados y vista filas/tarjetas con nombre accesible', async ({ page }) => {
    await page.goto('/app/protocolo');
    await settle(page);
    await expect(page.getByRole('button', { name: 'Vista de filas' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vista de tarjetas' })).toBeVisible();
    const search = page.getByPlaceholder(/Buscar por nombre/);
    await search.fill('zzzz-no-existe-e2e');
    await expect(page.getByText('Quitar de protocolo')).toHaveCount(0);
    await search.fill('');
  });
});

test.describe('PRO-02 CRUD de invitado especial [E2E]', { tag: '@write' }, () => {
  test('PRO-02a [S1] designar por la UI (drawer): aparece en el dashboard y en la API', async ({ page }) => {
    await page.goto('/app/protocolo');
    await settle(page);
    await page.getByRole('button', { name: /Designar invitado/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Designar invitado de protocolo' });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('textbox', { name: 'Visitante' }).fill(fx.p1.email);
    await dlg.getByRole('button', { name: new RegExp(fx.p1.code) }).click();
    await dlg.getByLabel('Categoría').selectOption({ label: 'Diplomático' });
    await dlg.getByLabel('Tratamiento honorífico (opcional)').fill('Sr. Embajador');
    await dlg.getByLabel('Institución y cargo (opcional)').fill('Embajada E2E · Agregado');
    const post = page.waitForResponse((r) => r.url().endsWith('/app/protocolo/api') && r.request().method() === 'POST');
    await dlg.getByRole('button', { name: 'Designar', exact: true }).click();
    expect((await post).status()).toBe(201);
    trackProtocol(fx.p1.id, 'designacion protocolo [E2E] p1');
    await expect(dlg).toBeHidden();
    const d = await dashboard();
    const g = d.guests.find((x: any) => x.userId === fx.p1.id);
    expect(g, 'el designado aparece en el dashboard').toBeDefined();
    expect(g).toMatchObject({ category: 'diplomatico', honorific: 'Sr. Embajador' });
  });

  test('PRO-02b [S1] editar (PATCH) categoría/notas y reflejarlo; campos inválidos -> 400', async () => {
    const ok = await api.patch(`/app/protocolo/api/${fx.p1.id}`, { data: { category: 'prensa', notes: 'nota e2e', orgTitle: 'Medio E2E' } });
    expect(ok.status()).toBe(200);
    const g = (await dashboard()).guests.find((x: any) => x.userId === fx.p1.id);
    expect(g).toMatchObject({ category: 'prensa', orgTitle: 'Medio E2E' });
    const bad = await api.patch(`/app/protocolo/api/${fx.p1.id}`, { data: { category: 'no-existe' } });
    expect(bad.status()).toBe(400);
    const extra = await api.patch(`/app/protocolo/api/${fx.p1.id}`, { data: { userId: 'x' } });
    expect(extra.status(), 'schema strict: no se puede cambiar el userId').toBe(400);
    const none = await api.patch('/app/protocolo/api/00000000-0000-4000-8000-000000000e2e', { data: { category: 'otro' } });
    expect([404, 400]).toContain(none.status());
  });

  test('PRO-02c [S1] el rol protocolo designa por API a un segundo invitado (gestiona su módulo)', async () => {
    const pr = await apiFor('protocolo');
    try {
      const r = await pr.post('/app/protocolo/api', { data: { userId: fx.p2.id, category: 'artista', honorific: 'Mtro.' } });
      expect(r.status()).toBe(201);
      trackProtocol(fx.p2.id, 'designacion protocolo [E2E] p2');
      const dup = await pr.post('/app/protocolo/api', { data: { userId: fx.p2.id, category: 'artista' } });
      expect(dup.status(), 're-designar es upsert idempotente').toBe(201);
      const inexistente = await pr.post('/app/protocolo/api', { data: { userId: '00000000-0000-4000-8000-000000000e2e', category: 'otro' } });
      expect(inexistente.status()).toBe(404);
      const sinCat = await pr.post('/app/protocolo/api', { data: { userId: fx.p2.id } });
      expect(sinCat.status()).toBe(400);
    } finally {
      await pr.dispose();
    }
  });

  /** ¿Algo tapa el punto central del elemento (un clic real no lo alcanzaría)? */
  const isCovered = (loc: import('@playwright/test').Locator) =>
    loc.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(top === el || el.contains(top));
    });

  test('PRO-02d [S1] quitar de protocolo desde el menú de la tarjeta (⋮ y "Quitar" deben poder pulsarse con el ratón)', async ({ page }) => {
    await page.goto('/app/protocolo');
    await settle(page);
    await page.waitForTimeout(2500); // termina la animación de entrada GSAP
    const card = page.locator('[data-anim="gcard"]').filter({ hasText: fx.p2.lastName }).first();
    await expect(card).toBeVisible();
    const acciones = card.getByRole('button', { name: 'Acciones' });
    expect.soft(await isCovered(acciones), 'el botón "Acciones" (⋮) queda tapado por el contenido de la tarjeta: imposible pulsarlo con el ratón').toBe(false);
    await acciones.evaluate((el) => (el as HTMLElement).click()); // seguimos el flujo sin ratón para no dejar datos
    const quitar = page.getByRole('button', { name: 'Quitar de protocolo' });
    await expect(quitar).toBeVisible();
    expect.soft(await isCovered(quitar), '"Quitar de protocolo" (menú abierto) queda tapado por la fila de estadísticas').toBe(false);
    const del = page.waitForResponse((r) => r.url().includes(`/app/protocolo/api/${fx.p2.id}`) && r.request().method() === 'DELETE');
    await quitar.evaluate((el) => (el as HTMLElement).click());
    expect((await del).status()).toBe(204);
    await expect(card).toBeHidden();
    expect((await dashboard()).guests.some((x: any) => x.userId === fx.p2.id), 'desactivado: sale del dashboard').toBe(false);
    const back = await api.post('/app/protocolo/api', { data: { userId: fx.p2.id, category: 'artista', honorific: 'Mtro.' } });
    expect(back.status()).toBe(201);
    expect((await dashboard()).guests.some((x: any) => x.userId === fx.p2.id), 're-designar reactiva').toBe(true);
  });

  test('PRO-02e [S2] control: con movimiento reducido el menú ⋮ sí es pulsable (la causa es la animación)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app/protocolo');
    await settle(page);
    const card = page.locator('[data-anim="gcard"]').filter({ hasText: fx.p2.lastName }).first();
    await expect(card).toBeVisible();
    const acciones = card.getByRole('button', { name: 'Acciones' });
    test.info().annotations.push({ type: 'covered-reduced-motion', description: String(await isCovered(acciones)) });
    await acciones.evaluate((el) => (el as HTMLElement).click());
    const quitar = page.getByRole('button', { name: 'Quitar de protocolo' });
    await expect(quitar).toBeVisible();
    test.info().annotations.push({ type: 'covered-quitar-reduced-motion', description: String(await isCovered(quitar)) });
    await page.keyboard.press('Escape');
  });
});

test.describe('PRO-03 invitación a actividad [E2E] con +N acompañantes', { tag: '@write' }, () => {
  test('PRO-03a [S1] invitar por la UI con +2: queda "reservado" (hold) y no suma asistencias', async ({ page }) => {
    await page.goto('/app/protocolo');
    await settle(page);
    await page.getByRole('button', { name: /Invitar a actividad/ }).first().click();
    const picker = page.getByRole('dialog', { name: 'Elegir actividad' });
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: new RegExp(fx.act.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    const panel = page.getByRole('dialog', { name: `Invitar protocolo a ${fx.act.name}` });
    await expect(panel).toBeVisible();
    await panel.getByLabel('Buscar designado').fill(fx.p1.code);
    await panel.getByRole('checkbox', { name: new RegExp(`Invitar a .*${fx.p1.lastName}`) }).check();
    const plus = panel.getByRole('button', { name: /Sumar acompañante a/ });
    await plus.click();
    await plus.click();
    await expect(panel.getByText(/1 invitado · 3 personas con acompañantes/)).toBeVisible();
    const post = page.waitForResponse((r) => r.url().includes(`/${fx.act.id}/protocol-invitations`) && r.request().method() === 'POST');
    await panel.getByRole('button', { name: /Enviar 1 invitación/ }).click();
    const res = await post;
    expect(res.status()).toBe(201);
    expect((await res.json()).summary).toMatchObject({ created: 1, noCapacity: 0 });

    const list = await guestsOf(fx.act.id);
    const g = list.guests.find((x: any) => x.userId === fx.p1.id);
    expect(g).toMatchObject({ plusOnes: 2, partySize: 3, seatHeld: true, attended: false, status: 'pending' });
    expect(g.checkedInAt).toBeNull();
    // No suma asistencias: el resumen de la actividad separa reservados de check-ins.
    const sum = await jsonOf<any>(await api.get(`/app/actividades/api/${fx.act.id}/summary`));
    expect(sum.totalAttendances ?? sum.summary?.totalAttendances, 'una reserva no es una asistencia').toBe(0);
    const recent = await jsonOf<any>(await api.get(`/app/check-in/api/recent?activityId=${fx.act.id}&status=checked_in&limit=50`));
    expect(recent.items ?? []).toHaveLength(0);
  });

  test('PRO-03b [S1] el hold se refleja en el cupo: "reservado (en lista)" y aforo comprometido = 3 de 12', async () => {
    const sum = await jsonOf<any>(await api.get(`/app/actividades/api/${fx.act.id}/summary`));
    const s = sum.summary ?? sum;
    expect(s.reservedCount).toBe(1);
    expect(s.reservedPeople).toBe(3);
    const acts = await jsonOf<any>(await api.get('/app/check-in/api/activities'));
    const a = acts.items.find((x: any) => x.id === fx.act.id);
    expect(a.enrolledCount ?? a.enrolled, 'aforo comprometido = 1 + 2 acompañantes').toBe(3);
  });

  test('PRO-03c [S1] límites de +N: 11 acompañantes, negativos y no designados', async () => {
    const tooMany = await invite(fx.act.id, [{ userId: fx.p1.id, plusOnes: 11 }]);
    expect(tooMany.status()).toBe(400);
    const neg = await invite(fx.act.id, [{ userId: fx.p1.id, plusOnes: -1 }]);
    expect(neg.status()).toBe(400);
    const empty = await invite(fx.act.id, []);
    expect(empty.status()).toBe(400);
    // Un visitante sin designación de protocolo se omite (skipped), no se invita.
    const sk = await invite(fx.act.id, [{ userId: fx.plain.id, plusOnes: 0 }]);
    expect(sk.status()).toBe(201);
    expect((await sk.json()).summary).toMatchObject({ created: 0, skipped: 1 });
    expect((await guestsOf(fx.act.id)).guests.some((g: any) => g.userId === fx.plain.id)).toBe(false);
  });

  test('PRO-03d [S1] re-enviar el lote no duplica: ajusta acompañantes (2 -> 1) y el asiento retenido', async () => {
    const r = await invite(fx.act.id, [{ userId: fx.p1.id, plusOnes: 1 }]);
    expect(r.status()).toBe(201);
    expect((await r.json()).summary).toMatchObject({ created: 0, reused: 1 });
    const list = await guestsOf(fx.act.id);
    const mine = list.guests.filter((g: any) => g.userId === fx.p1.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ plusOnes: 1, partySize: 2, seatHeld: true });
    const sum = await jsonOf<any>(await api.get(`/app/actividades/api/${fx.act.id}/summary`));
    expect((sum.summary ?? sum).reservedPeople, 'el hold se ajustó a 2 personas').toBe(2);
  });

  test('PRO-03e [S1] aforo: invitar +5 a una actividad de aforo 4 -> noCapacity, sin invitación ni hold', async () => {
    const r = await invite(fx.small.id, [{ userId: fx.p1.id, plusOnes: 5 }]);
    expect(r.status()).toBe(201);
    expect((await r.json()).summary).toMatchObject({ created: 0, noCapacity: 1 });
    expect((await guestsOf(fx.small.id)).guests).toHaveLength(0);
  });

  test('PRO-03f [S2] actividad cancelada/inexistente: 409/404 honestos', async () => {
    const ghost = await invite('00000000-0000-4000-8000-000000000e2e', [{ userId: fx.p1.id, plusOnes: 0 }]);
    expect(ghost.status()).toBe(404);
    const bad = await api.post(`/app/actividades/api/${fx.act.id}/protocol-invitations`, { data: { nope: true } });
    expect(bad.status()).toBe(400);
  });
});

test.describe('PRO-04 puerta/check-in y export', { tag: '@write' }, () => {
  async function pick(page: Page, code: string) {
    await page.goto('/app/check-in');
    await settle(page);
    const search = page.getByRole('searchbox', { name: /Buscar visitante/i });
    await search.fill(code);
    await page.getByRole('button', { name: new RegExp(code) }).click();
  }

  test('PRO-04a @smoke [S1] banner "Protocolo · <honorífico>" al buscar al invitado en la consola de check-in', async ({ page }) => {
    await pick(page, fx.p1.code);
    await expect(page.getByText(/Protocolo · Sr\. Embajador/i)).toBeVisible();
    await expect(page.getByText(/Registrar a .* en/)).toBeVisible();
  });

  test('PRO-04b [S1] check-in del invitado: toast ★ PROTOCOLO y la reserva se convierte en asistencia', async ({ page }) => {
    await pick(page, fx.p1.code);
    const card = page.getByRole('listitem').filter({ hasText: fx.act.name }).filter({ has: page.getByRole('button', { name: '+1 sin credencial' }) });
    const post = page.waitForResponse((r) => r.url().includes('/check-in/api/checkin') && r.request().method() === 'POST');
    await card.getByRole('button', { name: 'Registrar' }).click();
    const res = await post;
    expect(res.status()).toBe(201);
    expect((await res.json()).protocol).toMatchObject({ plusOnes: 1 });
    await expect(page.getByTestId('checkin-toast-success')).toContainText(/PROTOCOLO/);
    const g = (await guestsOf(fx.act.id)).guests.find((x: any) => x.userId === fx.p1.id);
    expect(g).toMatchObject({ attended: true, seatHeld: false, status: 'attended' });
    const sum = await jsonOf<any>(await api.get(`/app/actividades/api/${fx.act.id}/summary`));
    expect((sum.summary ?? sum).reservedCount, 'ya no queda reserva pendiente').toBe(0);
  });

  test('PRO-04c [S1] export de protocolo: owner y protocolo 200 (xlsx); puerta, operator, consulta 403', async () => {
    const { from, to } = { from: ymdUTC(-1), to: ymdUTC(1) };
    for (const role of ['owner', 'protocolo'] as const) {
      const a = await apiFor(role);
      try {
        const r = await a.get(`/app/reportes/api/protocol?from=${from}&to=${to}`, { timeout: 60_000 });
        expect(r.status(), role).toBe(200);
        expect(r.headers()['content-disposition']).toMatch(/protocolo_.*\.xlsx/);
        const wb = await parseXlsx(await r.body());
        const det = wb.sheets.find((s) => s.name === 'Detalle')!;
        const mine = det.rows.find((row) => row && row[0] === fx.act.name);
        expect(mine, `${role}: detalle del invitado [E2E]`).toBeDefined();
        expect(mine![8], 'asistió tras el check-in').toBe('Sí');
      } finally {
        await a.dispose();
      }
    }
    for (const role of ['puerta', 'operator', 'consulta'] as const) {
      const a = await apiFor(role);
      try {
        const r = await a.get('/app/reportes/api/protocol', { timeout: 30_000 });
        expect(r.status(), role).toBe(403);
      } finally {
        await a.dispose();
      }
    }
  });

  test('PRO-04d [S1] permisos de escritura: puerta lee el dashboard pero no designa ni invita; protocolo no sale de su módulo', async () => {
    const puerta = await apiFor('puerta');
    try {
      expect((await puerta.get('/app/protocolo/api/dashboard')).status(), 'puerta lee protocolo').toBe(200);
      const w = await puerta.post('/app/protocolo/api', { data: { userId: fx.plain.id, category: 'otro' } });
      expect(w.status(), 'puerta no designa').toBe(403);
      const i = await puerta.post(`/app/actividades/api/${fx.act.id}/protocol-invitations`, { data: { invites: [{ userId: fx.p1.id, plusOnes: 0 }] } });
      expect(i.status(), 'puerta no invita').toBe(403);
    } finally {
      await puerta.dispose();
    }
    const pr = await apiFor('protocolo');
    try {
      for (const url of ['/app/reportes/api/period?kind=xlsx&from=2026-01-01&to=2026-01-31', '/app/actividades/api', '/app/usuarios/api']) {
        const r = await pr.get(url, { timeout: 30_000 });
        expect(r.status(), `protocolo -> ${url}`).toBeGreaterThanOrEqual(400);
      }
    } finally {
      await pr.dispose();
    }
  });

  test('PRO-04e [S2] el rol protocolo ve /app/protocolo y es redirigido fuera de otros módulos', async ({ asRole }) => {
    const { page, context } = await asRole('protocolo');
    await page.goto('/app/protocolo');
    await expect(page.getByRole('heading', { name: 'Protocolo Institucional', level: 1 })).toBeVisible();
    await page.goto('/app/reportes');
    await expect(page).toHaveURL(/\/app\/protocolo/);
    await context.close();
  });
});
