// q4/pue-puerta.spec.ts · PUE-01 salas permanentes (Ada / VR), PUE-02 agenda VR, PUE-03 ventanas de fecha en
// stats/export (fix de zona 873c200 en staging), PUE-04 flag (lectura de código). Rol puerta (+owner para limpiar).
// Corre en desktop-1440 y tablet-820 (la puerta se usa en tablet). Solo staging; datos [E2E].
import type { APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { E2E_DIR } from '../../env';
import { expect, test } from '../../fixtures/test';
import { e2eEmail, runId, tag } from '../../fixtures/data';
import { apiFor, createVisitor, jsonOf, type CreatedVisitor } from '../../support/q3-api';
import { expectNoHorizontalOverflow } from '../../support/layout';
import { localDateTime, settle } from '../../support/q3-ui';
import { hhmmDR, isoFromDR, parseXlsx, q4Fixture, trackBooking, ymdDR, type XSheet } from '../../support/q4-common';
import { flushRows, registrar, salaByName, salasOf, snapshot, trackNew, type Sala } from '../../support/q4-puerta';

test.describe.configure({ retries: 0 }); // sin 'serial': un bug real no debe saltar el resto; el estado vive en la API

let door: APIRequestContext; // rol puerta
let owner: APIRequestContext; // preparar / limpiar
let ada: Sala;
let vr: Sala;
let v1: CreatedVisitor;

test.beforeAll(async () => {
  door = await apiFor('puerta');
  owner = await apiFor('owner');
  const salas = await salasOf(door);
  ada = salaByName(salas, /Ada/i);
  vr = salaByName(salas, /VR/i);
  v1 = await q4Fixture('pue-v1', async () => createVisitor(owner, 61, 'Puerta Uno'));
});
test.afterAll(async () => {
  test.setTimeout(180_000);
  await flushRows(owner);
  await door?.dispose();
  await owner?.dispose();
});

const visitorsToday = async (id: string) => (await salasOf(door)).find((s) => s.id === id)!.visitorsToday;
const statsOf = async (from: string, to: string, sala?: string) =>
  jsonOf<any>(await door.get(`/app/puerta/api/stats?from=${from}&to=${to}${sala ? `&sala=${sala}` : ''}`));

/** Filas de datos del export de la puerta (fila 5 en adelante). */
function exportRows(s: XSheet): unknown[][] {
  return s.rows.slice(4).filter((r) => r && r[0] !== null && r[0] !== '' && r[0] !== undefined && r[0] !== 'TOTAL');
}
async function exportOf(qs: string) {
  const res = await door.get(`/app/puerta/api/export${qs}`, { timeout: 60_000 });
  expect(res.status(), `export${qs}`).toBe(200);
  const wb = await parseXlsx(await res.body());
  return { wb, rows: exportRows(wb.sheets[0]!), sheet: wb.sheets[0]! };
}

test.describe('PUE-01 salas permanentes: registrar', { tag: '@write' }, () => {
  test('PUE-01a @smoke [S1] /app/puerta (rol puerta): ambas salas, "Registrar entrada" y visitantes hoy = API', async ({ asRole }, testInfo) => {
    const { page, context } = await asRole('puerta');
    await page.goto('/app');
    await expect(page, 'el rol puerta cae en su módulo').toHaveURL(/\/app\/puerta/);
    await settle(page);
    await expect(page.getByText('Ada Balcácer', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Sala VR', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Registrar entrada/ })).toHaveCount(2);
    await expect(page.getByRole('button', { name: /Registrar en ambas salas/ })).toBeVisible();
    const salas = await salasOf(door);
    const shown = (await page.getByText('Visitantes hoy').locator('xpath=following-sibling::div[1]').allInnerTexts()).map((t) => t.replace(/\D/g, ''));
    expect(shown, 'visitantes hoy por sala, en el orden de la API').toEqual(salas.map((s) => String(s.visitorsToday)));
    await expectNoHorizontalOverflow(page, `/app/puerta (${testInfo.project.name})`);
    await context.close();
  });

  test('PUE-01b [S1] UI: visitante nuevo con +2 acompañantes -> toast con credencial y +3 personas en la sala', async ({ asRole }) => {
    const { page, context } = await asRole('puerta');
    const before = await visitorsToday(ada.id);
    const snap = await snapshot(owner, [ada.id]);
    await page.goto('/app/puerta');
    await settle(page);
    await page.getByRole('button', { name: /Registrar entrada/ }).first().click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await dlg.getByLabel('Nombre', { exact: true }).fill(tag('Puerta Nuevo'));
    await dlg.getByLabel('Apellido').fill('Prueba62');
    await dlg.getByLabel('Email (opcional)').fill(e2eEmail(62));
    await dlg.getByLabel('Teléfono (opcional)').fill('809-555-0162');
    await dlg.getByRole('button', { name: 'Más acompañantes' }).click();
    await dlg.getByRole('button', { name: 'Más acompañantes' }).click();
    const post = page.waitForResponse((r) => r.url().includes('/app/puerta/api/registrar') && r.request().method() === 'POST');
    await dlg.getByRole('button', { name: /Registrar entrada · 3 personas/ }).click();
    const res = await post;
    expect(res.status()).toBe(201);
    const body = await res.json();
    const { trackVisitor } = await import('../../support/q3-api');
    if (body.code) trackVisitor(body.code, 'Puerta visitante nuevo UI');
    await trackNew(owner, snap, 'PUE-01b');
    await expect(page.getByRole('status')).toContainText(/Registrado .*\(CCB-[A-Z0-9]{6}\) en Ada Balcácer/);
    expect(await visitorsToday(ada.id)).toBe(before + 3);
    await context.close();
  });

  test('PUE-01c [S1] por código (con y sin prefijo): visitante existente, +3 acompañantes, VR infantil', async () => {
    const before = await visitorsToday(vr.id);
    const r = await registrar(door, owner, { salaIds: [vr.id], mode: 'identified', code: v1.code, companions: 3 }, 'PUE-01c');
    expect(r.status).toBe(201);
    expect(r.body.registered).toEqual([expect.objectContaining({ salaId: vr.id, partySize: 4 })]);
    expect(r.body.code).toBe(v1.code);
    expect(await visitorsToday(vr.id)).toBe(before + 4);
    // El código sin prefijo se resuelve con el prefijo del tenant.
    const bare = v1.code.split('-')[1]!;
    const r2 = await registrar(door, owner, { salaIds: [ada.id], mode: 'identified', code: bare }, 'PUE-01c-bare');
    expect(r2.status).toBe(201);
    expect(r2.body.code).toBe(v1.code);
    const nope = await registrar(door, owner, { salaIds: [ada.id], mode: 'identified', code: 'ZZZZZZ' }, 'PUE-01c-no');
    expect(nope.status).toBe(404);
    expect(nope.body.error).toMatch(/código/i);
  });

  test('PUE-01d [S1] UI "Buscar / QR": tipear el código manual y registrar', async ({ asRole }) => {
    const { page, context } = await asRole('puerta');
    const snap = await snapshot(owner, [ada.id]);
    const before = await visitorsToday(ada.id);
    await page.goto('/app/puerta');
    await settle(page);
    await page.getByRole('button', { name: /Registrar entrada/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: /Buscar \/ QR/ }).click();
    await dlg.getByPlaceholder(/tipear el código/).fill(v1.code);
    await dlg.getByRole('button', { name: 'Buscar', exact: true }).click();
    const post = page.waitForResponse((r) => r.url().includes('/app/puerta/api/registrar') && r.request().method() === 'POST');
    await dlg.getByRole('button', { name: /Registrar entrada/ }).last().click();
    expect((await post).status()).toBe(201);
    await trackNew(owner, snap, 'PUE-01d');
    expect(await visitorsToday(ada.id)).toBe(before + 1);
    await context.close();
  });

  test('PUE-01e [S1] grupo: colegio de 12 alumnos suma 13 personas y aparece como grupo', async () => {
    const before = await visitorsToday(vr.id);
    const r = await registrar(door, owner, {
      salaIds: [vr.id], mode: 'group',
      group: { colegio: tag('Colegio'), kind: null, level: '5.º primaria', contactName: 'Profe E2E', studentCount: 12 },
    }, 'PUE-01e');
    expect(r.status).toBe(201);
    expect(r.body.registered[0].partySize).toBe(13);
    expect(r.body.visitor).toContain('12 alumnos');
    expect(await visitorsToday(vr.id)).toBe(before + 13);
    // Grupo no-colegio ("integrantes").
    const r2 = await registrar(door, owner, {
      salaIds: [ada.id], mode: 'group',
      group: { colegio: tag('Grupo comunitario'), kind: 'Grupo comunitario', level: null, contactName: 'Responsable E2E', studentCount: 5 },
    }, 'PUE-01e-kind');
    expect(r2.status).toBe(201);
    expect(r2.body.visitor).toContain('5 integrantes');
  });

  test('PUE-01f [S1] ambas salas a la vez: dos entradas, cada una con su party size', async () => {
    const [a0, v0] = [await visitorsToday(ada.id), await visitorsToday(vr.id)];
    const r = await registrar(door, owner, { salaIds: [ada.id, vr.id], mode: 'anonymous', companions: 2 }, 'PUE-01f');
    expect(r.status).toBe(201);
    expect(r.body.registered).toHaveLength(2);
    expect(r.body.registered.every((x: any) => x.partySize === 3)).toBe(true);
    expect(r.body.visitor).toBeNull();
    expect(await visitorsToday(ada.id)).toBe(a0 + 3);
    expect(await visitorsToday(vr.id)).toBe(v0 + 3);
  });

  test('PUE-01g [S1] acompañantes ≤10: 10 pasa (11 personas), 11 y negativos se rechazan', async () => {
    const ok = await registrar(door, owner, { salaIds: [ada.id], mode: 'anonymous', companions: 10 }, 'PUE-01g');
    expect(ok.status).toBe(201);
    expect(ok.body.registered[0].partySize).toBe(11);
    for (const companions of [11, 99, -1, 2.5]) {
      const r = await registrar(door, owner, { salaIds: [ada.id], mode: 'anonymous', companions }, 'PUE-01g-bad');
      expect(r.status, `companions=${companions}`).toBe(400);
    }
    // En la UI el stepper no pasa de 10.
  });

  test('PUE-01h [S2] la UI no deja pasar de 10 acompañantes', async ({ asRole }) => {
    const { page, context } = await asRole('puerta');
    await page.goto('/app/puerta');
    await settle(page);
    await page.getByRole('button', { name: /Registrar entrada/ }).first().click();
    const dlg = page.getByRole('dialog');
    const mas = dlg.getByRole('button', { name: 'Más acompañantes' });
    // 10 clics llegan al tope (aria-disabled: sigue enfocable, Playwright lo trata como deshabilitado).
    for (let i = 0; i < 10; i++) await mas.click();
    await expect(mas).toBeDisabled();
    await expect(dlg.getByText('Máximo 10')).toBeVisible();
    await expect(dlg.getByRole('button', { name: /Registrar entrada · 11 personas/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await context.close();
  });

  test('PUE-01i [S2] validaciones: sala inexistente/no permanente, modos incompletos, campos extra -> 4xx sin 500', async () => {
    const acts = await jsonOf<any>(await owner.get('/app/check-in/api/activities'));
    const normal = acts.items?.find((a: any) => !/^Sala/.test(a.name))?.id;
    const cases: Array<[string, Record<string, unknown>, number[]]> = [
      ['sala inexistente', { salaIds: ['00000000-0000-4000-8000-000000000e2e'], mode: 'anonymous' }, [404]],
      ['salaIds vacío', { salaIds: [], mode: 'anonymous' }, [400]],
      ['5 salas', { salaIds: [ada.id, vr.id, ada.id, vr.id, ada.id], mode: 'anonymous' }, [400]],
      ['modo inválido', { salaIds: [ada.id], mode: 'vip' }, [400]],
      ['identified sin código', { salaIds: [ada.id], mode: 'identified' }, [400]],
      ['new sin visitante', { salaIds: [ada.id], mode: 'new' }, [400]],
      ['group sin grupo', { salaIds: [ada.id], mode: 'group' }, [400]],
      ['campo extra', { salaIds: [ada.id], mode: 'anonymous', evil: true }, [400]],
      ['group con 0 alumnos y sin responsable', { salaIds: [ada.id], mode: 'group', group: { colegio: 'x', contactName: '', studentCount: 0 } }, [400]],
    ];
    if (normal) cases.push(['actividad normal como sala', { salaIds: [normal], mode: 'anonymous' }, [404]]);
    for (const [name, body, allowed] of cases) {
      const res = await door.post('/app/puerta/api/registrar', { data: body });
      expect(allowed, `${name}: HTTP ${res.status()}`).toContain(res.status());
      expect(res.status(), `${name}: no debe registrar`).not.toBe(201);
    }
    // PUE-A09 (mig. 057): solo la sala con agenda recibe reservas; Ada (sin agenda) -> 409, y no se crea nada.
    expect(ada.hasAgenda, 'Ada no tiene agenda').toBe(false);
    expect(ada.kind).toBe('exposicion');
    const bk = await door.post('/app/puerta/api/bookings', {
      data: { salaId: ada.id, scheduledAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), colegio: 'E2E sin agenda', contactName: 'E2E', studentCount: 5 },
    });
    expect(bk.status(), 'reserva en sala sin agenda').toBe(409);
  });
});

test.describe('PUE-02 agenda VR', { tag: '@write' }, () => {
  const colegioEmail = () => `e2e+${runId().toLowerCase()}-colegio@test.local`;
  let bookingId = '';

  test('PUE-02a [S1] crear reserva [E2E] (contacto e2e+…-colegio@test.local), confirmar y reprogramar', async () => {
    const when = isoFromDR(ymdDR(2), 10, 0);
    const res = await door.post('/app/puerta/api/bookings', {
      data: { salaId: vr.id, scheduledAt: when, colegio: tag('Colegio agenda'), kind: null, level: '4.º', contactName: 'Profe Agenda', contactEmail: colegioEmail(), contactPhone: '809-555-0170', studentCount: 15, notes: 'e2e' },
    });
    expect(res.status()).toBe(201);
    const { booking } = await res.json();
    bookingId = booking.id;
    trackBooking(booking.id, 'PUE-02 reserva');
    expect(booking).toMatchObject({ status: 'scheduled', studentCount: 15, salaId: vr.id, contactEmail: colegioEmail(), attendanceId: null });
    expect(booking.salaName).toMatch(/VR/);

    const conf = await door.patch(`/app/puerta/api/bookings/${booking.id}`, { data: { action: 'confirm' } });
    expect(conf.status()).toBe(200);
    const c = (await conf.json()).booking;
    expect(c.status).toBe('confirmed');
    expect(c.confirmedAt).toBeTruthy();
    // En staging el correo va en dry-run (sin RESEND): no debe marcarse "avisado" si no se envió.
    test.info().annotations.push({ type: 'booking-email', description: `notifiedAt=${c.notifiedAt ? 'set' : 'null'}` });

    const moved = isoFromDR(ymdDR(2), 11, 30);
    const re = await door.patch(`/app/puerta/api/bookings/${booking.id}`, { data: { action: 'reschedule', scheduledAt: moved } });
    expect(re.status()).toBe(200);
    expect(new Date((await re.json()).booking.scheduledAt).toISOString()).toBe(moved);

    const list = await jsonOf<any>(await door.get(`/app/puerta/api/bookings?salaId=${vr.id}&from=${ymdDR(1)}T00:00:00-04:00&to=${ymdDR(4)}T00:00:00-04:00`));
    expect(list.bookings.some((b: any) => b.id === booking.id)).toBe(true);
  });

  test('PUE-02b [S1] check-in del booking (UI): crea hoy +1h, "Check-in" -> attended, entrada de grupo con 1+alumnos', async ({ asRole }, testInfo) => {
    const { page, context } = await asRole('puerta');
    const snap = await snapshot(owner, [vr.id]);
    const before = await visitorsToday(vr.id);
    const colegio = tag(`Colegio hoy ${testInfo.project.name}`); // único por proyecto: si no, el find() agarra la reserva del otro viewport
    await page.goto('/app/puerta');
    await settle(page);
    await page.getByRole('button', { name: /Nueva reserva/ }).first().click();
    await page.getByLabel('Fecha y hora').fill(localDateTime(60));
    await page.getByLabel('Colegio', { exact: true }).fill(colegio);
    await page.getByLabel('Nivel / grado').fill('3.º');
    await page.getByLabel('Cantidad de alumnos').fill('6');
    await page.getByLabel('Profesor responsable').fill('Profe Hoy');
    await page.getByLabel('Email del profesor').fill(colegioEmail());
    await page.getByRole('button', { name: 'Agendar' }).click();
    const row = page.locator('div.rounded-xl').filter({ hasText: colegio }).filter({ hasNot: page.getByText('Reservas de hoy') });
    await expect(row).toBeVisible();
    await expect(row.getByText('Agendada')).toBeVisible();
    // id de la reserva para el ledger
    const list = await jsonOf<any>(await door.get(`/app/puerta/api/bookings?salaId=${vr.id}`));
    const mine = list.bookings.find((b: any) => b.colegio === colegio);
    expect(mine).toBeDefined();
    trackBooking(mine.id, 'PUE-02b reserva');
    const post = page.waitForResponse((r) => r.url().includes(`/bookings/${mine.id}/checkin`) && r.request().method() === 'POST');
    await row.getByRole('button', { name: /Check-in/ }).click();
    expect((await post).status()).toBe(201);
    await trackNew(owner, snap, 'PUE-02b');
    await expect(row.getByText('Asistió')).toBeVisible();
    expect(await visitorsToday(vr.id), 'profesor + 6 alumnos').toBe(before + 7);
    const after = (await salasOf(door)).find((s) => s.id === vr.id)!;
    expect(after.todayBookings.find((b) => b.id === mine.id)).toMatchObject({ status: 'attended', studentCount: 6 });
    // Segundo check-in: 409 honesto, sin duplicar.
    const dup = await door.post(`/app/puerta/api/bookings/${mine.id}/checkin`);
    expect(dup.status()).toBe(409);
    expect((await dup.json()).error).toMatch(/ya tiene check-in/i);
    expect(await visitorsToday(vr.id)).toBe(before + 7);
    await context.close();
  });

  test('PUE-02c [S2] validaciones y estados: cancelada no hace check-in, no_show, inválidos y ajenos -> 4xx', async () => {
    const mk = async (extra: Record<string, unknown> = {}) =>
      door.post('/app/puerta/api/bookings', { data: { salaId: vr.id, scheduledAt: isoFromDR(ymdDR(3), 9, 0), colegio: tag('Colegio val'), contactName: 'Profe', studentCount: 3, ...extra } });
    const ok = await mk();
    expect(ok.status()).toBe(201);
    const id = (await ok.json()).booking.id;
    trackBooking(id, 'PUE-02c reserva');
    expect((await door.patch(`/app/puerta/api/bookings/${id}`, { data: { action: 'no_show' } })).status()).toBe(200);
    expect((await door.patch(`/app/puerta/api/bookings/${id}`, { data: { action: 'cancel' } })).status()).toBe(200);
    const ci = await door.post(`/app/puerta/api/bookings/${id}/checkin`);
    expect(ci.status(), 'cancelada: no se puede hacer check-in').toBe(409);
    expect((await door.patch(`/app/puerta/api/bookings/${id}`, { data: { action: 'volar' } })).status()).toBe(400);
    expect((await door.patch(`/app/puerta/api/bookings/${id}`, { data: { action: 'reschedule' } })).status(), 'reschedule sin fecha').toBe(400);
    expect((await door.patch('/app/puerta/api/bookings/00000000-0000-4000-8000-000000000e2e', { data: { action: 'cancel' } })).status()).toBe(404);
    expect((await door.post('/app/puerta/api/bookings/00000000-0000-4000-8000-000000000e2e/checkin')).status()).toBe(404);
    for (const bad of [{ studentCount: -1 }, { contactEmail: 'no-es-correo' }, { colegio: '' }, { scheduledAt: 'mañana' }, { salaId: '00000000-0000-4000-8000-000000000e2e' }]) {
      const r = await mk(bad);
      expect([400, 404], JSON.stringify(bad)).toContain(r.status());
    }
    // Hallazgo (observación, no gatea): un grupo mayor que el aforo de la sala VR (8) se acepta sin aviso.
    const big = await mk({ studentCount: 40 });
    test.info().annotations.push({ type: 'booking-aforo', description: `grupo de 40 en sala de aforo ${vr.aforo}: HTTP ${big.status()}` });
    if (big.status() === 201) trackBooking((await big.json()).booking.id, 'PUE-02c aforo');
  });
});

test.describe('PUE-03 ventanas de fecha (TZ America/Santo_Domingo)', { tag: '@write' }, () => {
  test('PUE-03a [S1] la agenda de HOY usa el día de Santo Domingo: 00:10 y 23:30 DR hoy entran; 00:30 DR de mañana no', async () => {
    const hoy = ymdDR(0);
    const manana = ymdDR(1);
    const names = { early: tag('Borde 00:10'), late: tag('Borde 23:30'), next: tag('Borde mañana 00:30') };
    const mk = async (colegio: string, iso: string) => {
      const r = await door.post('/app/puerta/api/bookings', { data: { salaId: ada.id, scheduledAt: iso, colegio, contactName: 'Borde', studentCount: 1 } });
      expect(r.status(), colegio).toBe(201);
      const id = (await r.json()).booking.id as string;
      trackBooking(id, colegio);
      return id;
    };
    const early = await mk(names.early, isoFromDR(hoy, 0, 10)); // 04:10 UTC de hoy
    const late = await mk(names.late, isoFromDR(hoy, 23, 30)); // 03:30 UTC de MAÑANA
    const next = await mk(names.next, isoFromDR(manana, 0, 30)); // 04:30 UTC de mañana
    const todayIds = ((await salasOf(door)).find((s) => s.id === ada.id)!.todayBookings).map((b) => b.id);
    expect(todayIds, '00:10 DR de hoy').toContain(early);
    expect(todayIds, '23:30 DR de hoy (ya es mañana en UTC)').toContain(late);
    expect(todayIds, '00:30 DR de mañana NO es de hoy').not.toContain(next);
    // La lista por defecto de la agenda ("desde el inicio de hoy") incluye las tres.
    const all = (await jsonOf<any>(await door.get(`/app/puerta/api/bookings?salaId=${ada.id}`))).bookings.map((b: any) => b.id);
    expect(all).toEqual(expect.arrayContaining([early, late, next]));
    // Ventana explícita [hoy 00:00 DR, mañana 00:00 DR): solo early y late.
    const win = (await jsonOf<any>(await door.get(`/app/puerta/api/bookings?salaId=${ada.id}&from=${encodeURIComponent(isoFromDR(hoy, 0, 0))}&to=${encodeURIComponent(isoFromDR(manana, 0, 0))}`))).bookings.map((b: any) => b.id);
    expect(win).toEqual(expect.arrayContaining([early, late]));
    expect(win).not.toContain(next);
  });

  test('PUE-03b [S1] stats y export por ventana: hoy incluye lo registrado hoy; ayer y mañana no; rango abierto sí', async () => {
    const hoy = ymdDR(0), ayer = ymdDR(-1), manana = ymdDR(1);
    const code = v1.code;
    // Garantiza al menos una entrada de este visitante hoy.
    const snapBefore = await snapshot(owner, [ada.id]);
    const reg = await door.post('/app/puerta/api/registrar', { data: { salaIds: [ada.id], mode: 'identified', code, companions: 1 } });
    expect(reg.status()).toBe(201);
    await trackNew(owner, snapBefore, 'PUE-03b');
    const nowDR = new Date();
    // El SQL viejo (sin ::timestamp) corría la ventana 8 h: solo se distingue de la correcta si la entrada se hace
    // después de las 16:00 hora DR. A mediodía el test pasa con ambos; se anota para que el informe sea honesto.
    test.info().annotations.push({ type: 'tz-discriminante', description: Number(hhmmDR(nowDR).slice(0, 2)) >= 16 ? 'sí (≥16:00 DR)' : `no (${hhmmDR(nowDR)} DR < 16:00)` });

    const todayStats = await statsOf(hoy, hoy);
    const yStats = await statsOf(ayer, ayer);
    const tStats = await statsOf(manana, manana);
    expect(todayStats.kpis.people).toBeGreaterThanOrEqual(2);
    expect(yStats.kpis.people, 'nada registrado ayer en staging').toBe(0);
    expect(tStats.kpis.people, 'nada registrado mañana').toBe(0);
    const bucket = todayStats.daily.find((d: any) => d.current > 0);
    expect(bucket, 'la serie diaria de hoy tiene la entrada').toBeDefined();

    const today = await exportOf(`?from=${hoy}&to=${hoy}`);
    const mine = today.rows.filter((r) => r[4] === code);
    expect(mine.length, 'el export de HOY incluye las entradas del visitante').toBeGreaterThanOrEqual(1);
    expect((await exportOf(`?from=${ayer}&to=${ayer}`)).rows.filter((r) => r[4] === code)).toHaveLength(0);
    expect((await exportOf(`?from=${manana}&to=${manana}`)).rows.filter((r) => r[4] === code)).toHaveLength(0);
    expect((await exportOf(`?from=${ayer}&to=${manana}`)).rows.filter((r) => r[4] === code).length).toBe(mine.length);
    expect((await exportOf('')).rows.filter((r) => r[4] === code).length, 'sin rango = todo el histórico').toBeGreaterThanOrEqual(mine.length);

    // Fecha y hora del export en hora de Santo Domingo.
    const row = mine[mine.length - 1]!;
    const fecha = String(row[1]); // dd/mm/yyyy
    const [dd, mm, yyyy] = fecha.split('/');
    expect(`${yyyy}-${mm}-${dd}`, 'columna Fecha').toBe(hoy);
    const [h] = String(row[2]).split(':').map(Number);
    expect(Math.abs(h! - Number(hhmmDR(nowDR).slice(0, 2))), `columna Hora "${row[2]}" vs ahora DR ${hhmmDR(nowDR)}`).toBeLessThanOrEqual(1);
    // Totales del subtítulo = suma de personas de las filas.
    const sub = String(today.sheet.rows[1]![0]);
    const total = today.rows.reduce((n, r) => n + Number(r[10]), 0);
    expect(sub).toContain(`${today.rows.length} registros`);
    expect(sub).toContain(`${total} personas`);
    const totalRow = today.sheet.rows.find((r) => r && r[0] === 'TOTAL');
    expect(totalRow?.[10], 'fila TOTAL del export').toBe(total);
    // Stats y export coinciden: personas de hoy.
    expect(todayStats.kpis.people, 'KPI people de stats = personas del export de hoy').toBe(total);
    expect(todayStats.kpis.entries).toBe(today.rows.length);
  });

  test('PUE-03c [S2] filtro por sala, rango inválido y validación de parámetros', async () => {
    const hoy = ymdDR(0);
    const soloVr = await exportOf(`?sala=${vr.id}&from=${hoy}&to=${hoy}`);
    expect(soloVr.rows.every((r) => /VR/.test(String(r[0])))).toBe(true);
    const nope = await door.get(`/app/puerta/api/export?sala=00000000-0000-4000-8000-000000000e2e`);
    expect(nope.status()).toBe(404);
    const inv = await door.get(`/app/puerta/api/stats?from=${ymdDR(2)}&to=${ymdDR(0)}`);
    expect(inv.status()).toBe(400);
    const noParams = await door.get('/app/puerta/api/stats');
    expect(noParams.status()).toBe(400);
    const huge = await door.get('/app/puerta/api/stats?from=2000-01-01&to=2030-01-01');
    expect(huge.status(), 'rango gigante: 400 honesto').toBe(400);
    const ignora = await door.get('/app/puerta/api/export?from=ayer&to=mañana', { timeout: 60_000 });
    expect(ignora.status(), 'fechas inválidas se ignoran (histórico) sin romper').toBe(200);
  });

  test('PUE-03d [S2] UI /app/puerta/reportes: KPIs de la ventana "Hoy" (selector de período) = API y Exportar Excel con el rango', async ({ asRole }, testInfo) => {
    const { page, context } = await asRole('puerta');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app/puerta/reportes');
    await expect(page.getByRole('heading', { name: 'Reportes de la Puerta', level: 1 })).toBeVisible();
    // R1: las pastillas de periodo se reemplazaron por el DateRangePicker del kit (patrón de ARC-A2/A3).
    const trigger = page.getByRole('button', { name: /^Período:/ });
    await expect(trigger).toBeEnabled();
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Período' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Hoy', exact: true }).click();
    // El periodo por defecto es «Este mes», así que aplicar «Hoy» dispara un fetch nuevo de stats.
    const resp = page.waitForResponse((r) => r.url().includes('/app/puerta/api/stats') && r.status() === 200);
    await dialog.getByRole('button', { name: 'Aplicar' }).click();
    const stats = await (await resp).json();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(500);
    const shown = await page.locator('[data-count]').evaluateAll((els) => els.slice(0, 4).map((e) => Number((e as HTMLElement).dataset.count)));
    expect(shown, 'Personas · Entradas · En grupo · Identificados').toEqual([stats.kpis.people, stats.kpis.entries, stats.kpis.groupPeople, stats.kpis.identified]);
    // R5: «Exportar Excel» es un SplitButton (link con el rango + menú «Más opciones de exportación» -> «Excel completo»).
    const href = await page.getByRole('link', { name: 'Exportar Excel' }).getAttribute('href');
    expect(href).toContain(`from=${stats.range.from}`);
    expect(href).toContain(`to=${stats.range.to}`);
    await page.getByRole('button', { name: 'Más opciones de exportación' }).click();
    const full = page.getByRole('menuitem', { name: /Excel completo/ });
    await expect(full).toBeVisible();
    expect((await full.getAttribute('href')) ?? '', 'Excel completo = todo el histórico, sin rango').not.toMatch(/[?&]from=/);
    await page.keyboard.press('Escape');
    await expectNoHorizontalOverflow(page, `/app/puerta/reportes (${testInfo.project.name})`);
    await context.close();
  });
});

test.describe('PUE-04 flag de producción (solo lectura de código)', () => {
  test('PUE-04 [S3][M] NEXT_PUBLIC_PUERTA_ENABLED es de build: oculta UI/páginas pero no los endpoints', async () => {
    const web = path.join(E2E_DIR, '..');
    const nav = readFileSync(path.join(web, 'lib/shell/nav.ts'), 'utf8');
    const board = readFileSync(path.join(web, 'app/app/puerta/page.tsx'), 'utf8');
    const reportes = readFileSync(path.join(web, 'app/app/puerta/reportes/page.tsx'), 'utf8');
    expect(nav).toMatch(/PUERTA_ENABLED\s*=\s*process\.env\.NEXT_PUBLIC_PUERTA_ENABLED === '1'/);
    // PUE-A13: las páginas usan el mismo puertaEnabled() (runtime, luego build) que el BFF.
    expect(board).toContain('if (!puertaEnabled()) notFound()');
    expect(reportes).toContain('if (!puertaEnabled()) notFound()');
    for (const f of ['registrar', 'salas', 'bookings', 'stats', 'export']) {
      const src = readFileSync(path.join(web, `app/app/puerta/api/${f}/route.ts`), 'utf8');
      // PR-10: el BFF respeta el flag (404 apagado). La API api-v2 /puerta/* sigue sin consultarlo (decisión del owner).
      expect(src, `BFF ${f} consulta el flag`).toContain('puertaEnabled()');
    }
    test.info().annotations.push({
      type: 'puerta-flag',
      description: 'build-time (NEXT_PUBLIC_*): cambiarlo exige rebuild/redeploy; los endpoints /app/puerta/api/* y api-v2 /puerta/* no lo respetan; un usuario con rol puerta con el flag apagado sería redirigido a un 404.',
    });
  });
});
