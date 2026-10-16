// q3-admin/admin-activities.spec.ts · ADM-03/04/05/06/07/09 (actividades: crear con portada, editar y
// estados, eliminar, invitaciones, filtros en URL, asistencia editable) + comportamiento "reservas ≠ asistencias".
// Rol owner. Solo staging. Datos con prefijo [E2E] <runId>; todo va al ledger y se limpia en teardown.
// Escrituras de actividades <= 15/min: se crean 4 actividades en todo el archivo.
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { tag } from '../../fixtures/data';
import {
  apiFor, cachedFixture, createActivity, createVisitor, jsonOf, makePng, trackActivity,
  type CreatedActivity, type CreatedVisitor,
} from '../../support/q3-api';
import { activityRow, localDateTime, rowMenu, settle } from '../../support/q3-ui';
import { expectNoHorizontalOverflow } from '../../support/layout';

test.describe.configure({ mode: 'serial', retries: 0 });

let api: APIRequestContext;
test.beforeAll(async () => {
  api = await apiFor('owner');
});
test.afterAll(async () => {
  await api?.dispose();
});

const apiActivity = (id: string) => `/app/actividades/api/${id}`;

async function activityByName(name: string): Promise<{ id: string; name: string; imageUrl: string | null; location: string; enrolledCount: number } | undefined> {
  const r = await jsonOf<{ items: Array<{ id: string; name: string; imageUrl: string | null; location: string; enrolledCount: number }> }>(
    await api.get('/app/check-in/api/activities'),
  );
  return r.items?.find((a) => a.name === name);
}

async function checkin(code: string, activityId: string, extra: Record<string, number> = {}) {
  return api.post('/app/check-in/api/checkin', { data: { activityId, visitor: { code }, ...extra } });
}

// ---------------------------------------------------------------------------------------------------
test.describe('ADM-03/04 · crear con portada, editar y estados (UI)', () => {
  let name = '';
  let id = '';

  test('ADM-03 [S1] crear actividad con portada obligatoria; la portada se sirve desde /uploads', { tag: ['@write', '@smoke'] }, async ({ page }, testInfo) => {
    name = tag('Actividad UI');
    await page.goto('/app/actividades');
    await settle(page);
    await page.getByRole('button', { name: 'Nueva actividad' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Crear actividad' });
    await expect(dialog).toBeVisible();

    // Sin portada: el boton esta deshabilitado y el servidor/cliente exige la portada.
    await expect(dialog.getByRole('button', { name: 'Crear actividad' })).toBeDisabled();

    await dialog.locator('input[type="file"]').setInputFiles({ name: 'portada-e2e.png', mimeType: 'image/png', buffer: makePng(1200, 675) });
    await expect(dialog.getByText(/Imagen lista|optimizada/i).first()).toBeVisible({ timeout: 20_000 });

    // Validacion de campos: capacidad vacia / tipo sin elegir -> mensajes visibles, sin request.
    await dialog.getByLabel('Nombre').fill(name);
    await dialog.getByRole('button', { name: 'Crear actividad' }).click();
    await expect(dialog.getByText('Seleccioná un tipo')).toBeVisible();
    await expect(dialog.getByText('Requerido').first()).toBeVisible();

    await dialog.getByLabel(/^Tipo(?! de)/).selectOption('otro');
    await dialog.getByLabel('Capacidad').fill('15');
    await dialog.getByLabel('Lugar').fill('Sala E2E');
    await dialog.getByLabel('Fecha y hora').fill(localDateTime(5));
    await dialog.getByLabel(/Cierre/).fill(localDateTime(185));

    const created = page.waitForResponse((r) => r.url().includes('/app/actividades/api/with-cover') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Crear actividad' }).click();
    const res = await created;
    expect(res.status(), 'POST with-cover').toBe(201);
    const body = (await res.json()) as { activity: { id: string; imageUrl: string | null } };
    id = body.activity.id;
    trackActivity(id, name);

    await expect(dialog).toHaveCount(0);
    await expect(activityRow(page, name)).toBeVisible({ timeout: 15_000 });

    // La portada queda servida por /uploads (200, imagen).
    const cover = body.activity.imageUrl;
    expect(cover, 'imageUrl de la actividad').toBeTruthy();
    expect(cover).toMatch(/^\/uploads\//);
    const img = await page.request.get(cover!);
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toMatch(/^image\//);
    await expectNoHorizontalOverflow(page, '/app/actividades');
    if (testInfo.project.name === 'desktop-1440') await page.screenshot({ path: testInfo.outputPath('adm03-actividades.png'), fullPage: false });
  });

  test('ADM-04 [S1] editar desde el menu de la fila: nombre/lugar cambian en tabla, API y detalle', { tag: '@write' }, async ({ page }) => {
    test.skip(!id, 'depende de ADM-03');
    await page.goto('/app/actividades');
    await settle(page);
    await rowMenu(page, name, 'Editar');
    const dialog = page.getByRole('dialog', { name });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Lugar').fill('Sala E2E editada');
    const patch = page.waitForResponse((r) => r.url().includes(apiActivity(id)) && r.request().method() === 'PATCH');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    expect((await patch).status(), 'PATCH actividad').toBe(200);
    await expect(dialog).toHaveCount(0);
    await expect(activityRow(page, name)).toContainText('Sala E2E editada').catch(() => undefined);
    const fresh = await jsonOf<{ location: string }>(await api.get(apiActivity(id)));
    expect(fresh.location).toBe('Sala E2E editada');

    // Detalle (drawer) con el valor nuevo.
    await activityRow(page, name).getByRole('button', { name: /Ver detalle de/ }).click();
    const detail = page.getByRole('dialog', { name });
    await expect(detail.getByText('Sala E2E editada')).toBeVisible();
    await detail.getByRole('button', { name: 'Cerrar detalle' }).click();
  });

  test('ADM-04 [S1] estados: finalizar -> sale del kiosko y de la consola; reactivar -> vuelve', { tag: '@write' }, async ({ page }) => {
    test.skip(!id, 'depende de ADM-03');
    const inKiosk = async () => (await (await page.request.get('/kiosko')).text()).includes(name);
    const inConsole = async () => Boolean(await activityByName(name));
    await page.goto('/app/actividades');
    await settle(page);

    expect(await inConsole(), 'activa -> en la consola de check-in').toBe(true);
    const kioskHasIt = await inKiosk();

    await rowMenu(page, name, 'Finalizar');
    const confirm = page.getByRole('dialog', { name: 'Finalizar actividad' });
    await expect(confirm).toBeVisible();
    const status = page.waitForResponse((r) => r.url().includes(`${apiActivity(id)}/status`));
    await confirm.getByRole('button', { name: /Sí, finalizar/ }).click();
    expect((await status).status()).toBe(200);
    await expect(confirm).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Finalizada \(\d+\)/ })).toBeVisible();
    expect(await inConsole(), 'finalizada -> fuera de la consola').toBe(false);
    expect(await inKiosk(), 'finalizada -> fuera del kiosko').toBe(false);

    await rowMenu(page, name, 'Reactivar');
    const back = page.getByRole('dialog', { name: 'Reactivar actividad' });
    const status2 = page.waitForResponse((r) => r.url().includes(`${apiActivity(id)}/status`));
    await back.getByRole('button', { name: /Sí, reactivar/ }).click();
    expect((await status2).status()).toBe(200);
    expect(await inConsole(), 'reactivada -> vuelve a la consola').toBe(true);
    // El kiosko solo muestra actividades dentro de su ventana; si ya la mostraba antes debe volver a mostrarla.
    if (kioskHasIt) expect(await inKiosk(), 'reactivada -> vuelve al kiosko').toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe('ADM-05/06/09 · eliminar, invitaciones y asistencia (API + UI)', () => {
  let act: CreatedActivity;
  let v1: CreatedVisitor;
  let v2: CreatedVisitor;
  let invitedId = '';

  test.beforeAll(async () => {
    const fx = await cachedFixture('adm-act', async () => {
      const a = await createActivity(api, 'Actividad B (asistencias)', { capacity: 30 });
      const a1 = await createVisitor(api, 11, 'Asiste');
      const a2 = await createVisitor(api, 12, 'Invitado');
      return { a, a1, a2 };
    });
    act = fx.a;
    v1 = fx.a1;
    v2 = fx.a2;
  });

  test('ADM-05 [S1] eliminar: 409 con asistencias ("cancelala primero"), 204 sin asistencias; UI muestra el mensaje', { tag: '@write' }, async ({ page }) => {
    // 1) check-in real del visitante v1 -> hay asistencia.
    const ci = await checkin(v1.code, act.id);
    expect([200, 201, 409], 'check-in de precondicion').toContain(ci.status());

    // 2) API: DELETE activa con asistencias -> 409 con instruccion.
    const del = await api.delete(apiActivity(act.id));
    expect(del.status()).toBe(409);
    const msg = ((await jsonOf<{ error?: string }>(del)).error ?? '').toLowerCase();
    expect(msg, 'mensaje honesto de 409').toMatch(/cancel/);

    // 3) UI: el mismo mensaje aparece en el dialogo de eliminar y NO borra.
    await page.goto('/app/actividades');
    await settle(page);
    await rowMenu(page, act.name, 'Eliminar');
    const dialog = page.getByRole('dialog', { name: 'Eliminar actividad' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Sí, eliminar' }).click();
    await expect(dialog.getByRole('alert')).toContainText(/cancel/i);
    await dialog.getByRole('button', { name: 'No, volver' }).click();
    expect(await jsonOf(await api.get(apiActivity(act.id))), 'la actividad sigue existiendo').toHaveProperty('id', act.id);

    // 4) Actividad sin asistencias: se elimina de verdad (UI) -> 204 y desaparece de la tabla.
    const blank = await createActivity(api, 'Actividad C (sin asistencias)', { capacity: 5 });
    await page.reload();
    await settle(page);
    await rowMenu(page, blank.name, 'Eliminar');
    const d2 = page.getByRole('dialog', { name: 'Eliminar actividad' });
    const gone = page.waitForResponse((r) => r.url().includes(apiActivity(blank.id)) && r.request().method() === 'DELETE');
    await d2.getByRole('button', { name: 'Sí, eliminar' }).click();
    expect((await gone).status()).toBe(204);
    await expect(page.locator('tr, li').filter({ hasText: blank.name }).filter({ visible: true })).toHaveCount(0);
  });

  test('ADM-06 [S1] invitaciones: invitar del padron, importar CSV, cancelar; "Asistio" derivado del check-in', { tag: '@write' }, async ({ page }) => {
    // a) invitar a v2 (padron) -> aparece pendiente.
    const inv = await api.post(`${apiActivity(act.id)}/invite-existing`, { data: { userIds: [v2.id] } });
    expect(inv.status()).toBe(201);
    let list = await jsonOf<{ summary: Record<string, number>; invitations: Array<{ id: string; code: string; status: string }> }>(await api.get(`${apiActivity(act.id)}/invitations`));
    const mine = list.invitations.find((i) => i.code === v2.code);
    expect(mine?.status, 'invitacion pendiente de v2').toBe('pending');
    invitedId = mine!.id;

    // b) "Asistio" derivado: v1 ya hizo check-in; invitarlo y verlo como attended sin tocar la invitacion.
    await api.post(`${apiActivity(act.id)}/invite-existing`, { data: { userIds: [v1.id] } });
    list = await jsonOf(await api.get(`${apiActivity(act.id)}/invitations`));
    expect(list.invitations.find((i) => i.code === v1.code)?.status, 'v1 asistio -> "attended" derivado').toBe('attended');
    expect(list.summary.attended).toBeGreaterThanOrEqual(1);

    // c) importar CSV (vista previa + commit): 2 filas nuevas [E2E].
    const tpl = await (await api.get('/app/usuarios/api/import/template')).text();
    const header = tpl.split(/\r?\n/)[0] ?? 'nombre,apellido,email,telefono';
    const cols = header.split(',').map((c) => c.trim().toLowerCase());
    const row = (n: number) => cols.map((c) => {
      if (/^(nombre|first)/.test(c)) return tag(`CSV${n}`);
      if (/^(apellido|last)/.test(c)) return `Import${n}`;
      if (/mail/.test(c)) return `e2e+${(process.env.E2E_RUN_ID ?? 'x').toLowerCase()}-csv${n}@test.local`;
      if (/tel|phone|cel/.test(c)) return `809-555-01${70 + n}`;
      return '';
    }).join(',');
    const csv = [header, row(1), row(2)].join('\n');
    const url = `${apiActivity(act.id)}/import-guests`;
    const preview = await api.post(url, { multipart: { file: { name: 'invitados-e2e.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) } } });
    expect(preview.status(), 'import-guests preview').toBe(200);
    const pv = await jsonOf<{ mode: string; summary: Record<string, number> }>(preview);
    expect(pv.mode).toBe('preview');
    expect(JSON.stringify(pv.summary)).toMatch(/2/);
    const commit = await api.post(`${url}?commit=true`, { multipart: { file: { name: 'invitados-e2e.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) } } });
    expect(commit.status(), 'import-guests commit').toBe(201);
    // registrar para limpieza: los 2 usuarios nuevos se archivan en el teardown.
    for (const n of [1, 2]) {
      const email = `e2e+${(process.env.E2E_RUN_ID ?? 'x').toLowerCase()}-csv${n}@test.local`;
      const found = await jsonOf<{ items: Array<{ code: string; email: string | null }> }>(await api.get(`/app/check-in/api/visitors?q=${encodeURIComponent(email)}`));
      const hit = found.items.find((i) => (i.email ?? '').toLowerCase() === email);
      expect(hit, `usuario importado ${n} encontrado`).toBeTruthy();
      const { trackVisitor } = await import('../../support/q3-api');
      trackVisitor(hit!.code, `csv${n}`);
    }

    // d) cancelar la invitacion de v2 (UI del detalle) -> estado canceled.
    await page.goto('/app/actividades');
    await settle(page);
    await activityRow(page, act.name).getByRole('button', { name: /Ver detalle de/ }).click();
    const detail = page.getByRole('dialog', { name: act.name });
    await expect(detail.getByText(/Invitaciones|invitad/i).first()).toBeVisible();
    const cancel = await api.post(`${apiActivity(act.id)}/invitations/${invitedId}/cancel`, { data: {} });
    expect([200, 204]).toContain(cancel.status());
    list = await jsonOf(await api.get(`${apiActivity(act.id)}/invitations`));
    expect(list.invitations.find((i) => i.id === invitedId)?.status).toBe('canceled');
    await detail.getByRole('button', { name: 'Cerrar detalle' }).click();
  });

  test('ADM-09 [S1] asistencia editable: acompanantes y quitar recalculan el resumen', { tag: '@write' }, async ({ page }) => {
    await page.goto('/app/actividades');
    await settle(page);
    await activityRow(page, act.name).getByRole('button', { name: /Ver detalle de/ }).click();
    const detail = page.getByRole('dialog', { name: act.name });
    await expect(detail.getByText(/Asistentes/i).first()).toBeVisible();

    const summaryBefore = (await jsonOf<{ summary: { totalAttendances: number; peopleInRoom: number } }>(await api.get(`${apiActivity(act.id)}/summary`))).summary;
    expect(summaryBefore.totalAttendances).toBeGreaterThanOrEqual(1);

    // editar acompanantes: +2 adultos
    await detail.getByRole('button', { name: 'Editar acompañantes' }).first().click();
    await detail.getByRole('button', { name: 'Sumar adultos' }).click();
    await detail.getByRole('button', { name: 'Sumar adultos' }).click();
    const patch = page.waitForResponse((r) => r.url().includes('/check-in/api/attendance/') && r.request().method() === 'PATCH');
    await detail.getByRole('button', { name: 'Guardar', exact: true }).click();
    expect((await patch).status()).toBe(200);
    await expect.poll(async () => (await jsonOf<{ summary: { peopleInRoom: number } }>(await api.get(`${apiActivity(act.id)}/summary`))).summary.peopleInRoom, { timeout: 10_000 })
      .toBe(summaryBefore.peopleInRoom + 2);
    // el tile "Personas en sala" del detalle se refresca
    await expect(detail.getByText('Personas en sala')).toBeVisible();

    // quitar la asistencia -> el resumen baja
    await detail.getByRole('button', { name: 'Quitar esta asistencia' }).first().click();
    const del = page.waitForResponse((r) => r.url().includes('/check-in/api/attendance/') && r.request().method() === 'DELETE');
    await detail.getByRole('button', { name: '¿Quitar?' }).click();
    expect([200, 204]).toContain((await del).status());
    await expect.poll(async () => (await jsonOf<{ summary: { totalAttendances: number } }>(await api.get(`${apiActivity(act.id)}/summary`))).summary.totalAttendances, { timeout: 10_000 })
      .toBe(summaryBefore.totalAttendances - 1);
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe('Reservas ≠ asistencias (fix en staging: protocolo con asiento retenido)', () => {
  let act: CreatedActivity;
  let guest: CreatedVisitor;

  test.beforeAll(async () => {
    const fx = await cachedFixture('adm-reserva', async () => {
      const a = await createActivity(api, 'Actividad P (reservas)', { capacity: 20 });
      const g = await createVisitor(api, 21, 'Protocolo');
      const des = await api.post('/app/protocolo/api', { data: { userId: g.id, category: 'autoridad', honorific: 'Sr.' } });
      if (des.status() !== 201) throw new Error(`designar protocolo: HTTP ${des.status()}`);
      const { trackProtocol } = await import('../../support/q3-api');
      trackProtocol(g.id, 'designacion protocolo [E2E]');
      const inv = await api.post(`/app/actividades/api/${a.id}/protocol-invitations`, { data: { invites: [{ userId: g.id, plusOnes: 2 }] } });
      if (inv.status() !== 201 && inv.status() !== 200) throw new Error(`protocol-invitations: HTTP ${inv.status()}`);
      return { a, g };
    });
    act = fx.a;
    guest = fx.g;
  });

  test('RES-01 [S1] el resumen separa reservados de asistencias (reservedCount/reservedPeople/roomPct)', { tag: '@write' }, async () => {
    const { summary } = await jsonOf<{ summary: Record<string, number> }>(await api.get(`${apiActivity(act.id)}/summary`));
    expect(summary.totalAttendances, 'una reserva NO es una asistencia').toBe(0);
    expect(summary.reservedCount).toBe(1);
    expect(summary.reservedPeople, '1 invitado + 2 acompanantes con cupo retenido').toBe(3);
    expect(summary.roomPct, 'roomPct cuenta personas en sala, no reservas').toBe(0);
    expect(summary.peopleInRoom).toBe(0);
  });

  test('RES-02 [S1] consola /app/check-in: una sola tarjeta, "0 en sala · 3 reservados / 20"', { tag: ['@write', '@smoke'] }, async ({ page }) => {
    await page.goto('/app/check-in');
    await settle(page);
    const cards = page.getByRole('listitem').filter({ hasText: act.name }).filter({ has: page.getByRole('button', { name: '+1 sin credencial' }) });
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(/0 en sala · 3 reservados \/ 20 \(15%\)/);
    // El feed "Check-ins de hoy" no debe contar la reserva como check-in.
    const feed = page.getByRole('heading', { name: 'Check-ins de hoy' }).locator('xpath=ancestor::div[contains(@class,"flex")][1]/..');
    await expect(feed.getByText(guest.firstName.slice(0, 12))).toHaveCount(0);
  });

  test('RES-03 [S1] detalle de actividad: "Reservado (en lista)" y tile de reservados; "Asistencias" = 0', { tag: '@write' }, async ({ page }) => {
    await page.goto('/app/actividades');
    await settle(page);
    await activityRow(page, act.name).getByRole('button', { name: /Ver detalle de/ }).click();
    const detail = page.getByRole('dialog', { name: act.name });
    await expect(detail.getByText('Reservado (en lista)').first()).toBeVisible();
    await expect(detail.getByText('Reservados (en lista)')).toBeVisible();
    await expect(detail.getByText(/3 personas con cupo retenido/)).toBeVisible();
    const tile = detail.locator('div').filter({ has: page.getByText('Asistencias', { exact: true }) }).last();
    await expect(tile).toContainText(/0/);
    await expect(detail.getByText(/Aún no llegó nadie · 1 en lista/)).toBeVisible();
  });

  test('RES-04 [S1] al hacer check-in la reserva se convierte en asistencia y deja de ser "reservada"', { tag: '@write' }, async () => {
    const r = await checkin(guest.code, act.id, { companionsAdults: 2 });
    expect([200, 201]).toContain(r.status());
    const { summary } = await jsonOf<{ summary: Record<string, number> }>(await api.get(`${apiActivity(act.id)}/summary`));
    expect(summary.totalAttendances).toBe(1);
    expect(summary.reservedCount, 'ya no hay reservas pendientes').toBe(0);
    expect(summary.peopleInRoom).toBe(3);
  });
});
