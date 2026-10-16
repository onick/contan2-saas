// q5 · Biblioteca · flujos de ESCRITURA (BIB-03 a BIB-08) -- rol `biblioteca`, SOLO staging, desktop-1440.
// Los datos se resuelven "get-or-create" contra la DB (no hay estado en memoria entre tests), asi un
// worker nuevo tras un fallo no duplica nada. Todo lo creado queda en el ledger (limpieza en teardown).
//   titulos  "[E2E] <runId> ..."   ejemplares E2E-<runId>-NN   lectores e2e+<runId>-lectorN@test.local
import { expect, test } from '../../fixtures/test';
import { tag } from '../../fixtures/data';
import { statePath } from '../../fixtures/roles';
import {
  BibApi, createItem, createReader, createTitle, ensureE2ESite, itemCode, lend, ledgerInventory,
  ledgerItem, ledgerLoan, ledgerReader, ledgerReservation, readerIdentity, tinyPng,
  type Site, type TestReader,
} from '../../support/q5-biblio';
import type { APIRequestContext, Page } from '@playwright/test';

test.use({ storageState: statePath('biblioteca') });
test.describe.configure({ retries: 0 });

let ctx: APIRequestContext;
let api: BibApi;
const cache: {
  site?: Site;
  titles: Record<string, { id: string; title: string }>;
  items: Record<number, { id: string; code: string }>;
  readers: Record<number, TestReader>;
} = { titles: {}, items: {}, readers: {} };

// --------------------------- get-or-create ---------------------------------
async function site(): Promise<Site> {
  return (cache.site ??= await ensureE2ESite(api));
}
async function title(key: string, extra: Record<string, unknown> = {}): Promise<{ id: string; title: string }> {
  if (cache.titles[key]) return cache.titles[key]!;
  const full = tag(key);
  const found = await api.get<{ titles: Array<{ id: string; title: string }> }>(`/titles?q=${encodeURIComponent(full)}&pageSize=5`);
  const hit = found.json?.titles?.find((t) => t.title === full);
  return (cache.titles[key] = hit ?? (await createTitle(api, key, extra)));
}
async function item(n: number, titleKey: string, withSite = true): Promise<{ id: string; code: string }> {
  if (cache.items[n]) return cache.items[n]!;
  const t = await title(titleKey);
  const detail = await api.get<{ items: Array<{ id: string; inventoryCode: string }> }>(`/titles/${t.id}`);
  const hit = detail.json?.items?.find((i) => i.inventoryCode === itemCode(n));
  if (hit) {
    ledgerItem(hit.id, hit.inventoryCode);
    return (cache.items[n] = { id: hit.id, code: hit.inventoryCode });
  }
  return (cache.items[n] = await createItem(api, t.id, n, withSite ? await site() : undefined));
}
async function reader(n: number, type: 'empleado' | 'no_empleado' = 'no_empleado'): Promise<TestReader> {
  if (cache.readers[n]) return cache.readers[n]!;
  const id = readerIdentity(n);
  const found = await api.get<{ readers: Array<{ userId: string; code: string }> }>(`/readers?q=${encodeURIComponent(id.email)}`);
  const hit = found.json?.readers?.[0];
  if (hit) {
    ledgerReader(hit.code);
    return (cache.readers[n] = { userId: hit.userId, code: hit.code, ...id });
  }
  return (cache.readers[n] = await createReader(api, n, type));
}
/** Cierra cualquier prestamo abierto de estos ejemplares (idempotente). */
async function giveBack(...codes: string[]): Promise<void> {
  for (const c of codes) await api.post('/returns', { inventoryCode: c });
}
/** Cancela reservas activas de estos lectores (idempotente). */
async function cancelReservationsOf(...users: TestReader[]): Promise<void> {
  for (const u of users) {
    const r = await api.get<{ reservations: Array<{ id: string; status: string }> }>(`/readers/${u.userId}/reservations`);
    for (const x of r.json?.reservations ?? []) {
      if (x.status === 'espera' || x.status === 'lista') await api.post(`/reservations/${x.id}/cancel`, {});
    }
  }
}

/** Deja a los lectores E2E sin prestamos abiertos ni reservas activas (aislamiento entre tests). */
async function resetReaders(): Promise<void> {
  for (let n = 1; n <= 4; n++) {
    const id = readerIdentity(n);
    const found = await api.get<{ readers: Array<{ userId: string }> }>(`/readers?q=${encodeURIComponent(id.email)}`);
    const u = found.json?.readers?.[0];
    if (!u) continue;
    const loans = await api.get<{ loans: Array<{ returnedAt: string | null; inventoryCode: string }> }>(`/readers/${u.userId}/loans`);
    for (const l of loans.json?.loans ?? []) if (!l.returnedAt) await api.post('/returns', { inventoryCode: l.inventoryCode });
    const res = await api.get<{ reservations: Array<{ id: string; status: string }> }>(`/readers/${u.userId}/reservations`);
    for (const x of res.json?.reservations ?? []) {
      if (x.status === 'espera' || x.status === 'lista') await api.post(`/reservations/${x.id}/cancel`, {});
    }
  }
}

test.beforeAll(async ({ playwright }, testInfo) => {
  if (testInfo.project.name !== 'desktop-1440') return;
  ctx = await playwright.request.newContext({ baseURL: String(testInfo.project.use.baseURL), storageState: statePath('biblioteca') });
  api = new BibApi(ctx);
});
test.afterAll(async () => {
  await ctx?.dispose();
});
test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'flujos de escritura solo en desktop-1440');
});

async function dialogOf(page: Page) {
  const d = page.getByRole('dialog');
  await expect(d).toBeVisible();
  return d;
}

// =============================================================================
// BIB-03 · Nuevo titulo
// =============================================================================
test.describe('BIB-03 nuevo titulo', () => {
  test('alta manual por la UI con portada multipart', { tag: '@write' }, async ({ page }) => {
    const name = tag('Alfa');
    // evita duplicar si el test se repite en la misma corrida
    const found = await api.get<{ titles: Array<{ title: string }> }>(`/titles?q=${encodeURIComponent(name)}&pageSize=5`);
    test.skip((found.json?.titles ?? []).some((t) => t.title === name), 'titulo Alfa ya creado en esta corrida');

    await page.goto('/app/biblioteca/titulos/nuevo');
    await expect(page.getByRole('heading', { level: 1, name: 'Nuevo título' })).toBeVisible();
    // "Guardar" deshabilitado sin titulo
    await expect(page.getByRole('button', { name: 'Guardar', exact: true }).first()).toBeDisabled();

    await page.getByRole('textbox', { name: /^Título/ }).fill(name);
    await page.getByLabel('Autor principal', { exact: true }).fill('Gabriel García Márquez');
    await page.getByLabel('Editorial', { exact: true }).fill('Editorial E2E');
    await page.getByLabel('Año', { exact: true }).fill('1967');
    await page.getByLabel('Clasificación (Dewey)').fill('863.7');
    const materias = page.getByLabel('Materia(s) / Temas');
    await materias.fill('Novela E2E');
    await materias.press('Enter');
    await expect(page.getByRole('button', { name: 'Quitar Novela E2E' })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({ name: 'portada-e2e.png', mimeType: 'image/png', buffer: tinyPng() });
    await expect(page.getByRole('button', { name: 'Agregar portada' })).toBeVisible();

    await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
    await expect(page).toHaveURL(/\/app\/biblioteca\/titulos\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    const id = page.url().split('/').pop()!;
    cache.titles['Alfa'] = { id, title: name };

    // La portada multipart quedo guardada y se sirve
    const d = await api.get<{ title: { coverUrl: string | null } }>(`/titles/${id}`);
    expect(d.json.title.coverUrl, 'coverUrl tras subir la portada').toBeTruthy();
    const img = await ctx.get(d.json.title.coverUrl!);
    expect(img.status(), 'GET de la portada').toBe(200);
    expect(img.headers()['content-type'] ?? '').toMatch(/^image\//);
  });

  test('validacion: portada no-imagen se rechaza (415/400) y titulo vacio no guarda', { tag: '@write' }, async () => {
    const t = await title('Alfa');
    const bad = await ctx.post(`/app/biblioteca/api/titles/${t.id}/cover`, {
      multipart: { cover: { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('no soy una imagen') } },
    });
    expect([400, 415], `portada invalida -> HTTP ${bad.status()}`).toContain(bad.status());
    const empty = await api.post('/titles', { kind: 'libro', title: '', authors: [] });
    expect(empty.status).toBe(400);
  });

  test('ISBN autofill (timeout 10 s; fuente externa)', { tag: '@write' }, async ({ page }, testInfo) => {
    await page.goto('/app/biblioteca/titulos/nuevo');
    await page.getByLabel('ISBN', { exact: true }).fill('9780140328721');
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Buscar por ISBN y completar la ficha' }).click();
    const ok = page.getByText(/Ficha completada desde/);
    const miss = page.getByText(/No encontramos ese ISBN|No pudimos consultar el ISBN/);
    const winner = await Promise.race([
      ok.waitFor({ timeout: 10_000 }).then(() => 'ok' as const),
      miss.waitFor({ timeout: 10_000 }).then(() => 'miss' as const),
    ]).catch(() => 'timeout' as const);
    if (winner !== 'ok') {
      testInfo.annotations.push({ type: 'saltado por red', description: `fuente ISBN no respondio con datos (${winner}, ${Date.now() - t0} ms)` });
      test.skip(true, `saltado por red: ISBN externo sin datos (${winner})`);
    }
    await expect(page.getByRole('textbox', { name: /^Título/ })).not.toHaveValue('');
    // Se guarda con prefijo [E2E] para poder identificarlo
    const name = tag('ISBN-autofill');
    await page.getByRole('textbox', { name: /^Título/ }).fill(name);
    await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
    await expect(page).toHaveURL(/\/titulos\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByText('Ficha por ISBN')).toBeVisible();
    cache.titles['ISBN-autofill'] = { id: page.url().split('/').pop()!, title: name };
  });
});

// =============================================================================
// BIB-04 · Ficha: ejemplares por sitio/estante, retirar
// =============================================================================
test.describe('BIB-04 ficha y ejemplares', () => {
  test('agregar ejemplar por el drawer: sitio + estante visibles en la ficha', { tag: '@write' }, async ({ page }) => {
    const t = await title('Alfa');
    const s = await site();
    const code = itemCode(1);
    const detail = await api.get<{ items: Array<{ id: string; inventoryCode: string }> }>(`/titles/${t.id}`);
    test.skip((detail.json?.items ?? []).some((i) => i.inventoryCode === code), 'ejemplar 01 ya existe');

    await page.goto(`/app/biblioteca/titulos/${t.id}`);
    await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
    await expect(page.getByText(/Este título todavía no tiene ejemplares/)).toBeVisible();
    await page.getByRole('button', { name: 'Agregar ejemplar' }).click();
    const dlg = await dialogOf(page);
    const submit = dlg.getByRole('button', { name: 'Agregar ejemplar' });
    await expect(submit).toBeDisabled();
    await dlg.getByLabel('Código de inventario').fill(code);
    await dlg.getByLabel('Sitio físico').selectOption(s.id);
    await dlg.getByLabel('Estante / depósito').fill('Estante E2E-1');
    await submit.click();
    await expect(dlg).toBeHidden();
    const row = page.getByRole('listitem').filter({ hasText: code });
    await expect(row).toContainText(`${s.name} · Estante E2E-1`);
    await expect(row).toContainText('Bueno');
    const again = await api.get<{ items: Array<{ id: string; inventoryCode: string }> }>(`/titles/${t.id}`);
    const it = again.json.items.find((i) => i.inventoryCode === code)!;
    ledgerItem(it.id, code);
    cache.items[1] = { id: it.id, code };
  });

  test('codigo de inventario duplicado se rechaza con mensaje', { tag: '@write' }, async () => {
    const t = await title('Alfa');
    await item(1, 'Alfa');
    const dup = await api.post(`/titles/${t.id}/items`, { inventoryCode: itemCode(1) });
    expect(dup.status).toBe(409);
    expect(String(dup.json?.error)).toMatch(/ya existe/i);
  });

  test('preparar el resto de datos (titulos, ejemplares, lectores) por API', { tag: '@write' }, async () => {
    await item(2, 'Alfa'); // A2
    await item(3, 'Beta'); // B1 (sitio)
    await item(4, 'Beta'); // B2 (sitio)
    await item(5, 'Beta', false); // B3 (sin sitio -> fuera de ubicacion en el inventario)
    await item(6, 'Gamma'); // C1
    await title('Delta'); // sin ejemplares
    for (const n of [2, 3, 4]) await reader(n);
    expect(Object.keys(cache.items).length).toBe(6);
  });

  test('retirar ejemplar desde la ficha exige motivo y queda "Dado de baja"', { tag: '@write' }, async ({ page }) => {
    // ejemplar descartable propio para no romper los demas flujos
    const t = await title('Delta');
    const created = await createItem(api, t.id, 9, await site());
    await page.goto(`/app/biblioteca/titulos/${t.id}`);
    const row = page.getByRole('listitem').filter({ hasText: created.code });
    await row.getByRole('button', { name: 'Dar de baja' }).click();
    const confirm = row.getByRole('button', { name: 'Confirmar baja' });
    await expect(confirm).toBeDisabled();
    await row.getByLabel('Motivo de la baja').fill('ab');
    await expect(confirm, 'motivo < 3 caracteres no confirma').toBeDisabled();
    await row.getByLabel('Motivo de la baja').fill('Prueba E2E de baja');
    await confirm.click();
    await expect(row).toContainText('Dado de baja');
    await expect(row).toContainText('Prueba E2E de baja');
    await expect(row.getByRole('button', { name: 'Dar de baja' })).toHaveCount(0);
  });

  test('HIPOTESIS: no se debe poder dar de baja un ejemplar con prestamo abierto', { tag: '@write' }, async () => {
    const t = await title('Delta');
    const it = await createItem(api, t.id, 8, await site());
    const l1 = await reader(2);
    try {
      const loan = await lend(api, l1.code, it.code);
      expect(loan.status).toBe(201);
      const r = await api.patch(`/items/${it.id}`, { retiredReason: 'Prueba E2E: baja con prestamo abierto' });
      expect(r.status, 'dar de baja un ejemplar prestado deberia rechazarse (409), no aceptarse').toBeGreaterThanOrEqual(400);
    } finally {
      await giveBack(it.code);
    }
  });
});

// =============================================================================
// BIB-05 · Lectores (= padron)
// =============================================================================
test.describe('BIB-05 lectores', () => {
  test('alta de lector EMPLEADO por la UI (entra al padron con carne QR)', { tag: '@write' }, async ({ page }) => {
    const id = readerIdentity(1);
    const found = await api.get<{ readers: Array<{ userId: string; code: string }> }>(`/readers?q=${encodeURIComponent(id.email)}`);
    test.skip((found.json?.readers ?? []).length > 0, 'lector 1 ya existe');

    await page.goto('/app/biblioteca/lectores');
    await page.getByRole('button', { name: 'Nuevo lector' }).first().click();
    const dlg = await dialogOf(page);
    const crear = dlg.getByRole('button', { name: 'Crear lector' });
    await expect(crear).toBeDisabled();
    await dlg.getByLabel('Nombre', { exact: true }).fill(id.firstName);
    await dlg.getByLabel('Apellido', { exact: true }).fill(id.lastName);
    await dlg.getByLabel('Correo (opcional)').fill(id.email);
    await dlg.getByLabel('Teléfono (opcional)').fill(id.phone);
    await dlg.getByRole('button', { name: 'Empleado', exact: true }).click();
    await dlg.getByLabel('Código de empleado (RRHH)').fill('EMP-E2E-1');
    await crear.click();
    await expect(dlg).toBeHidden({ timeout: 20_000 });

    // el panel de detalles queda con el lector recien creado
    const panel = page.locator('aside');
    await expect(panel.getByText(`${id.firstName} ${id.lastName}`)).toBeVisible();
    await expect(panel.getByText('Empleado').first()).toBeVisible();
    await expect(panel.getByText('EMP-E2E-1')).toBeVisible();

    const got = await api.get<{ readers: Array<{ userId: string; code: string; readerType: string; employeeCode: string | null }> }>(
      `/readers?q=${encodeURIComponent(id.email)}`,
    );
    const r = got.json.readers[0]!;
    expect(r.readerType).toBe('empleado');
    expect(r.employeeCode).toBe('EMP-E2E-1');
    expect(r.code, 'carne QR generado').toMatch(/^[A-Z0-9]+-/);
    ledgerReader(r.code);
    cache.readers[1] = { userId: r.userId, code: r.code, ...id };
  });

  test('correo duplicado en el padron: 409 con mensaje claro', { tag: '@write' }, async () => {
    await reader(1, 'empleado');
    const id = readerIdentity(1);
    const dup = await api.post('/readers', { firstName: 'Otro', lastName: 'E2E', email: id.email, readerType: 'no_empleado' });
    expect(dup.status).toBe(409);
    expect(String(dup.json?.error)).toMatch(/correo/i);
  });

  test('buscar, filtrar por tipo y estado; no-empleado no muestra codigo RRHH', { tag: '@write' }, async ({ page }) => {
    const l1 = await reader(1, 'empleado');
    const l2 = await reader(2);
    await page.goto('/app/biblioteca/lectores');
    const buscar = page.getByLabel('Buscar lectores');
    await buscar.fill(l1.email);
    await expect(page.getByRole('button', { name: `Ver detalles de ${l1.firstName} ${l1.lastName}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Ver detalles de ${l2.firstName} ${l2.lastName}` })).toHaveCount(0);
    // por runId aparecen los 4 lectores E2E
    await buscar.fill(`e2e+${l1.email.split('+')[1]!.split('-lector')[0]}`);
    await expect(page.getByRole('button', { name: /Ver detalles de \[E2E\] Lector/ })).not.toHaveCount(0);
    await page.getByLabel('Tipo de lector').selectOption('no_empleado');
    await expect(page.getByRole('button', { name: `Ver detalles de ${l1.firstName} ${l1.lastName}` })).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Ver detalles de ${l2.firstName} ${l2.lastName}` })).toBeVisible();
    await page.getByRole('button', { name: `Ver detalles de ${l2.firstName} ${l2.lastName}` }).click();
    await expect(page.locator('aside').getByText('No empleado').first()).toBeVisible();
    await expect(page.locator('aside').getByText('Código de empleado')).toHaveCount(0);
  });

  test('suspender y reactivar (UI): bloquea prestamos y reservas hasta reactivar', { tag: '@write' }, async ({ page }) => {
    const l3 = await reader(3);
    const it = await item(2, 'Alfa'); // A2
    await giveBack(it.code);
    await page.goto('/app/biblioteca/lectores');
    await page.getByLabel('Buscar lectores').fill(l3.email);
    await page.getByRole('button', { name: `Ver detalles de ${l3.firstName} ${l3.lastName}` }).click();
    const panel = page.locator('aside');
    await panel.getByRole('button', { name: 'Suspender servicio' }).click();
    await panel.getByLabel('Motivo (opcional)').fill('Prueba E2E');
    await panel.getByRole('button', { name: 'Suspender', exact: true }).click();
    await expect(panel.getByText('Suspendido').first()).toBeVisible();
    await expect(panel.getByText('Prueba E2E')).toBeVisible();

    // La suspension se hace cumplir en API (prestamo y reserva) y en el precheck
    const loan = await lend(api, l3.code, it.code);
    expect(loan.status).toBe(409);
    expect(String(loan.json.error)).toMatch(/suspendid/i);
    const t = await title('Gamma');
    const res = await api.post('/reservations', { readerCode: l3.code, titleId: t.id });
    expect(res.status).toBe(409);
    const pre = await api.get<{ reader: { suspended: boolean } }>(`/loans/precheck?readerCode=${encodeURIComponent(l3.code)}`);
    expect(pre.json.reader.suspended).toBe(true);

    await panel.getByRole('button', { name: 'Reactivar servicio' }).click();
    await expect(panel.getByText('Activo').first()).toBeVisible();
    const ok = await lend(api, l3.code, it.code);
    expect(ok.status, 'reactivado: ya puede pedir prestado').toBe(201);
    await giveBack(it.code);
  });

  test('el panel del lector muestra su historial de prestamos (tab Prestamos)', { tag: '@write' }, async ({ page }) => {
    const l3 = await reader(3);
    await page.goto('/app/biblioteca/lectores');
    await page.getByLabel('Buscar lectores').fill(l3.email);
    await page.getByRole('button', { name: `Ver detalles de ${l3.firstName} ${l3.lastName}` }).click();
    await page.locator('aside').getByRole('tab', { name: 'Préstamos' }).click();
    await expect(page.locator('aside').getByText(/Devueltos/)).toBeVisible();
  });

  test('copy desactualizado en el panel: "llegan con Circulacion (F2)"', { tag: '@write' }, async ({ page }) => {
    const l3 = await reader(3);
    await page.goto('/app/biblioteca/lectores');
    await page.getByLabel('Buscar lectores').fill(l3.email);
    await page.getByRole('button', { name: `Ver detalles de ${l3.firstName} ${l3.lastName}` }).click();
    await expect(page.locator('aside').getByRole('tab', { name: 'Información' })).toBeVisible();
    await expect(page.locator('aside').getByText(/llegan con Circulación \(F2\)/),
      'Circulacion (F2) ya esta en produccion: el texto "llegan con Circulacion (F2)" es copy obsoleto').toHaveCount(0);
  });
});

// =============================================================================
// BIB-06 · Circulacion
// =============================================================================
test.describe('BIB-06 circulacion', () => {
  test('prestamo a domicilio por UI en 2 escaneos, con precheck en vivo', { tag: '@write' }, async ({ page }) => {
    const l1 = await reader(1, 'empleado');
    const a1 = await item(1, 'Alfa');
    const t = await title('Alfa');
    await giveBack(a1.code);
    await page.goto('/app/biblioteca/circulacion');
    await expect(page.getByRole('heading', { level: 1, name: 'Préstamos' })).toBeVisible();
    await page.getByRole('button', { name: 'Nuevo préstamo' }).first().click();
    const dlg = await dialogOf(page);
    const confirmar = dlg.getByRole('button', { name: 'Confirmar préstamo' });
    await expect(confirmar).toBeDisabled();

    // escaneo 1: carne
    await dlg.getByPlaceholder(/Escanea o escribe el código — CCB/).fill(l1.code);
    await expect(dlg.getByText(`${l1.firstName} ${l1.lastName}`)).toBeVisible();
    await expect(dlg.getByText(/Empleado · 0\/3 préstamos/)).toBeVisible();
    await expect(confirmar, 'solo con el carne no alcanza').toBeDisabled();
    // escaneo 2: ejemplar
    await dlg.getByPlaceholder(/Escanea o escribe el inventario/).fill(a1.code);
    await expect(dlg.getByText(`${a1.code} ✓`)).toBeVisible();
    await expect(dlg.getByText(/Vencimiento:/)).toBeVisible();
    await expect(confirmar).toBeEnabled();
    await confirmar.click();
    await expect(dlg).toBeHidden({ timeout: 20_000 });
    ledgerLoan(a1.code);
    await expect(page.getByText(new RegExp(`Prestado: «${t.title.replace(/[[\]]/g, '\\$&')}» a ${l1.firstName.replace(/[[\]]/g, '\\$&')}`))).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: a1.code });
    await expect(row).toContainText(l1.lastName);
  });

  test('precheck: carne inexistente, ejemplar inexistente y ejemplar ya prestado', { tag: '@write' }, async ({ page }) => {
    const l1 = await reader(1, 'empleado');
    const a1 = await item(1, 'Alfa');
    const ensure = await lend(api, l1.code, a1.code);
    expect([201, 409]).toContain(ensure.status); // 409 si ya estaba prestado (del test anterior)
    await page.goto('/app/biblioteca/circulacion');
    await page.getByRole('button', { name: 'Nuevo préstamo' }).first().click();
    const dlg = await dialogOf(page);
    await dlg.getByPlaceholder(/Escanea o escribe el código — CCB/).fill('NOEXISTE-0000');
    await expect(dlg.getByText('Ese carné no aparece en el padrón.')).toBeVisible();
    await dlg.getByPlaceholder(/Escanea o escribe el inventario/).fill('E2E-NO-EXISTE-99');
    await expect(dlg.getByText('Ese código de ejemplar no existe.')).toBeVisible();
    await dlg.getByPlaceholder(/Escanea o escribe el inventario/).fill(a1.code);
    await expect(dlg.getByText(/Ya está prestado/)).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Confirmar préstamo' })).toBeDisabled();
  });

  test('renovar: +14 dias, maximo 2; la 3.a renovacion se rechaza con mensaje', { tag: '@write' }, async ({ page }) => {
    const l1 = await reader(1, 'empleado');
    const a1 = await item(1, 'Alfa');
    const t = await title('Alfa');
    await giveBack(a1.code);
    const loan = await lend(api, l1.code, a1.code);
    expect(loan.status).toBe(201);
    const due0 = new Date(loan.json.loan.dueAt).getTime();
    expect(Math.round((due0 - Date.now()) / 86_400_000), 'prestamo a 14 dias').toBeGreaterThanOrEqual(13);

    await page.goto('/app/biblioteca/circulacion');
    const renew = page.getByRole('button', { name: `Renovar ${t.title}` });
    await renew.click();
    await expect(page.getByText(/Renovado: «/)).toBeVisible();
    await renew.click();
    await expect(page.getByText(/Renovado: «/)).toBeVisible();
    await expect.poll(async () => (await api.get<{ loans: Array<{ renewals: number; inventoryCode: string }> }>(`/loans?tab=activos&q=${encodeURIComponent(a1.code)}`)).json.loans[0]?.renewals).toBe(2);
    await renew.click();
    await expect(page.getByRole('status').filter({ hasText: /Límite alcanzado: máximo 2 renovaciones/ })).toBeVisible();
    const raw = await api.get<{ loans: Array<{ id: string; renewals: number; dueAt: string }> }>(`/loans?tab=activos&q=${encodeURIComponent(a1.code)}`);
    expect(raw.json.loans[0]!.renewals).toBe(2);
    const dueNow = (new Date(raw.json.loans[0]!.dueAt).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(dueNow), 'tras renovar vence ~14 dias desde hoy').toBeGreaterThanOrEqual(13);
    const third = await api.post(`/loans/${raw.json.loans[0]!.id}/renew`, {});
    expect(third.status).toBe(409);
  });

  test('renovar extiende +14 dias sobre el vencimiento vigente (decision 6.8)', { tag: '@write' }, async () => {
    const l1 = await reader(1, 'empleado');
    const a1 = await item(1, 'Alfa');
    await resetReaders();
    const loan = await lend(api, l1.code, a1.code);
    expect(loan.status).toBe(201);
    const due0 = new Date(loan.json.loan.dueAt).getTime();
    const renewed = await api.post(`/loans/${loan.json.loan.id}/renew`, {});
    expect(renewed.status).toBe(200);
    const gained = (new Date(renewed.json.loan.dueAt).getTime() - due0) / 86_400_000;
    await giveBack(a1.code);
    expect(gained, 'el boton dice "Renovar (+14 dias)": renovar el mismo dia del prestamo mueve el vencimiento 14 dias (max(due, hoy) + 14)').toBeGreaterThanOrEqual(13);
  });

  test('devolver por UI (boton de la fila) y por escaneo (drawer Devolucion)', { tag: '@write' }, async ({ page }) => {
    const a1 = await item(1, 'Alfa');
    const a2 = await item(2, 'Alfa');
    const t = await title('Alfa');
    const l1 = await reader(1, 'empleado');
    await resetReaders();
    const first = await lend(api, l1.code, a1.code);
    expect(first.status).toBe(201);
    const second = await lend(api, l1.code, a2.code);
    expect(second.status).toBe(201);
    await page.goto('/app/biblioteca/circulacion');
    // 1) boton "Devolver" de la fila (A1)
    await page.getByRole('row').filter({ hasText: a1.code }).getByRole('button', { name: `Devolver ${t.title}` }).click();
    await expect(page.getByText(new RegExp(`Devuelto: «.*» \\(${a1.code}\\)`))).toBeVisible();
    // 2) drawer de devolucion con 1 escaneo (A2)
    await page.getByRole('button', { name: 'Devolución' }).first().click();
    const dlg = await dialogOf(page);
    await dlg.getByPlaceholder(/Escanea o escribe el inventario/).fill(a2.code);
    await dlg.getByRole('button', { name: 'Registrar devolución' }).click();
    await expect(dlg).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(new RegExp(`Devuelto: «.*» \\(${a2.code}\\)`))).toBeVisible();
    // 3) devolver algo que no esta prestado -> error claro
    const again = await api.post('/returns', { inventoryCode: a2.code });
    expect(again.status).toBe(409);
    expect(String(again.json.error)).toMatch(/no tiene un préstamo abierto/i);
  });

  test('consulta en sala: no cuenta contra el limite, no se renueva, vence hoy', { tag: '@write' }, async ({ page }) => {
    const l2 = await reader(2);
    const a1 = await item(1, 'Alfa');
    await giveBack(a1.code);
    const sala = await lend(api, l2.code, a1.code, 'sala');
    expect(sala.status).toBe(201);
    expect(sala.json.loan.kind).toBe('sala');
    expect(new Date(sala.json.loan.dueAt).toDateString(), 'vence el mismo dia').toBe(new Date(sala.json.loan.loanedAt).toDateString());
    const renew = await api.post(`/loans/${sala.json.loan.id}/renew`, {});
    expect(renew.status).toBe(409);
    expect(String(renew.json.error)).toMatch(/sala/i);
    await page.goto('/app/biblioteca/circulacion');
    await expect(page.getByRole('row').filter({ hasText: a1.code })).toContainText('En sala');
    await giveBack(a1.code);
  });

  test('limite: el 4.o prestamo a domicilio se rechaza (API 409 + UI deshabilitada); sala sigue permitida', { tag: '@write' }, async ({ page }) => {
    const l2 = await reader(2);
    const codes = [(await item(1, 'Alfa')).code, (await item(2, 'Alfa')).code, (await item(3, 'Beta')).code];
    const fourth = await item(4, 'Beta');
    await resetReaders();
    await giveBack(...codes, fourth.code);
    for (const c of codes) {
      const r = await lend(api, l2.code, c);
      expect(r.status, `prestamo ${c}`).toBe(201);
    }
    const rejected = await lend(api, l2.code, fourth.code);
    expect(rejected.status, 'S0: el 4.o prestamo a domicilio DEBE rechazarse').toBe(409);
    expect(String(rejected.json?.error)).toMatch(/Límite alcanzado: 3/);

    // UI: precheck marca el limite y bloquea el boton
    await page.goto('/app/biblioteca/circulacion');
    await page.getByRole('button', { name: 'Nuevo préstamo' }).first().click();
    const dlg = await dialogOf(page);
    await dlg.getByPlaceholder(/Escanea o escribe el código — CCB/).fill(l2.code);
    await expect(dlg.getByText(/3\/3 préstamos — límite alcanzado/)).toBeVisible();
    await dlg.getByPlaceholder(/Escanea o escribe el inventario/).fill(fourth.code);
    await expect(dlg.getByText(`${fourth.code} ✓`)).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Confirmar préstamo' })).toBeDisabled();
    // En sala el mismo lector si puede (no cuenta cupo)
    await dlg.getByRole('button', { name: /En sala/ }).click();
    await expect(dlg.getByRole('button', { name: 'Registrar consulta' })).toBeEnabled();
    await dlg.getByRole('button', { name: 'Cerrar' }).click();

    const sala = await lend(api, l2.code, fourth.code, 'sala');
    expect(sala.status, 'sala con 3 prestamos abiertos').toBe(201);
    await giveBack(...codes, fourth.code);
  });

  test('Resumen de hoy y alertas reflejan la actividad', { tag: '@write' }, async ({ page }) => {
    const s = await api.get<{ today: { loans: number; returns: number }; policy: { loanDays: number; maxRenewals: number; maxOpenLoans: number } }>('/loans/summary');
    expect(s.json.policy).toEqual({ loanDays: 14, maxRenewals: 2, maxOpenLoans: 3 });
    expect(s.json.today.loans).toBeGreaterThan(0);
    expect(s.json.today.returns).toBeGreaterThan(0);
    await page.goto('/app/biblioteca/circulacion');
    await expect(page.getByRole('heading', { name: 'Resumen de hoy' })).toBeVisible();
  });
});

// =============================================================================
// BIB-07 · Reservas (FIFO por titulo)
// =============================================================================
test.describe('BIB-07 reservas', () => {
  test('FIFO con 2 lectores: espera 1-2, devolver pasa a "lista" al primero, cancelar promueve al segundo', { tag: '@write' }, async ({ page }) => {
    const l2 = await reader(2);
    const l3 = await reader(3);
    const l4 = await reader(4);
    const c1 = await item(6, 'Gamma');
    const t = await title('Gamma');
    await resetReaders();
    await cancelReservationsOf(l2, l3, l4);
    await giveBack(c1.code);
    const loan = await lend(api, l2.code, c1.code);
    expect(loan.status).toBe(201); // Gamma agotado

    // L3 reserva por la UI (Nueva reserva)
    await page.goto('/app/biblioteca/reservas');
    await expect(page.getByRole('heading', { level: 1, name: 'Reservas' })).toBeVisible();
    await page.getByRole('button', { name: 'Nueva reserva' }).first().click();
    const dlg = await dialogOf(page);
    await dlg.getByPlaceholder(/Escanea o escribe el código — CCB/).fill(l3.code);
    await dlg.getByPlaceholder(/Busca por título, autor o ISBN/).fill(t.title);
    await dlg.getByRole('button', { name: new RegExp(t.title.replace(/[[\]]/g, '\\$&')) }).click();
    await expect(dlg.getByText(/Todo prestado — entra a la fila de espera/)).toBeVisible();
    await dlg.getByRole('button', { name: 'Crear reserva' }).click();
    await expect(dlg).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(/reservada para .* — posición 1 en la fila/)).toBeVisible();

    // L4 reserva por API -> posicion 2
    const r4 = await api.post('/reservations', { readerCode: l4.code, titleId: t.id });
    expect(r4.status).toBe(201);
    expect(r4.json.reservation.status).toBe('espera');
    expect(r4.json.reservation.position).toBe(2);
    ledgerReservation(r4.json.reservation.id);
    const mine = await api.get<{ reservations: Array<{ id: string; status: string; position: number | null }> }>(`/readers/${l3.userId}/reservations`);
    const r3 = mine.json.reservations.find((x) => x.status === 'espera')!;
    expect(r3.position).toBe(1);
    ledgerReservation(r3.id);

    // UI: la lista de espera muestra ambas con su posicion
    await page.getByRole('tab', { name: 'Lista de espera' }).click();
    await expect(page.getByText('En espera · Posición 1').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('En espera · Posición 2').filter({ visible: true }).first()).toBeVisible();

    // Devolucion de C1 -> la reserva de L3 pasa a "lista" con C1 apartado; L4 queda #1
    const back = await api.post('/returns', { inventoryCode: c1.code });
    expect(back.status).toBe(200);
    const l3list = await api.get<{ reservations: Array<{ id: string; status: string; inventoryCode: string | null; expiresAt: string | null }> }>(`/readers/${l3.userId}/reservations`);
    const ready = l3list.json.reservations.find((x) => x.id === r3.id)!;
    expect(ready.status).toBe('lista');
    expect(ready.inventoryCode).toBe(c1.code);
    const days = Math.round((new Date(ready.expiresAt!).getTime() - Date.now()) / 86_400_000);
    expect(days, 'ventana de retiro ~3 dias (pickupDays=3, redondeo al dia)').toBeGreaterThanOrEqual(2);
    expect(days).toBeLessThanOrEqual(4);
    const l4list = await api.get<{ reservations: Array<{ id: string; status: string; position: number | null }> }>(`/readers/${l4.userId}/reservations`);
    const still = l4list.json.reservations.find((x) => x.id === r4.json.reservation.id)!;
    expect(still.status).toBe('espera');
    expect(still.position).toBe(1);

    // El ejemplar apartado NO se le puede prestar a otra persona
    const stolen = await lend(api, l4.code, c1.code);
    expect(stolen.status).toBe(409);
    expect(String(stolen.json.error)).toMatch(/apartado por una reserva/i);

    // Cancelar la de L3 por la UI -> promueve a L4
    await page.reload();
    await expect(page.getByText('Lista para retirar').filter({ visible: true }).first()).toBeVisible();
    await page.getByRole('button', { name: `Cancelar reserva de ${t.title}` }).filter({ visible: true }).first().click();
    await expect(page.getByText(/Cancelada la reserva de «/)).toBeVisible();
    await expect.poll(async () => {
      const x = await api.get<{ reservations: Array<{ id: string; status: string }> }>(`/readers/${l4.userId}/reservations`);
      return x.json.reservations.find((y) => y.id === r4.json.reservation.id)?.status;
    }).toBe('lista');
  });

  test('entregar la reserva "lista" la convierte en prestamo y la marca cumplida', { tag: '@write' }, async ({ page }) => {
    const l4 = await reader(4);
    const c1 = await item(6, 'Gamma');
    const t = await title('Gamma');
    const mine = await api.get<{ reservations: Array<{ id: string; status: string }> }>(`/readers/${l4.userId}/reservations`);
    test.skip(!mine.json.reservations.some((r) => r.status === 'lista'), 'sin reserva lista de L4 (depende del test FIFO)');
    await page.goto('/app/biblioteca/reservas');
    await page.getByLabel('Buscar reservas').fill(l4.code);
    await page.getByRole('button', { name: `Entregar ${t.title}` }).filter({ visible: true }).first().click();
    await expect(page.getByText(/Entregado: «/)).toBeVisible();
    ledgerLoan(c1.code);
    const after = await api.get<{ reservations: Array<{ status: string }> }>(`/readers/${l4.userId}/reservations`);
    expect(after.json.reservations.some((r) => r.status === 'cumplida')).toBe(true);
    await giveBack(c1.code);
  });

  test('maximo 3 reservas activas por lector; la 4.a se rechaza (mensaje en UI)', { tag: '@write' }, async ({ page }) => {
    const l2 = await reader(2);
    await resetReaders();
    const keys = ['Alfa', 'Beta', 'Delta'];
    for (const k of keys) {
      const t = await title(k);
      const r = await api.post('/reservations', { readerCode: l2.code, titleId: t.id });
      expect(r.status, `reserva ${k}`).toBe(201);
      ledgerReservation(r.json.reservation.id);
    }
    const g = await title('Gamma');
    const over = await api.post('/reservations', { readerCode: l2.code, titleId: g.id });
    expect(over.status, 'la 4.a reserva activa debe rechazarse').toBe(409);
    expect(String(over.json.error)).toMatch(/Límite alcanzado: 3/);

    await page.goto('/app/biblioteca/reservas');
    await page.getByRole('button', { name: 'Nueva reserva' }).first().click();
    const dlg = await dialogOf(page);
    await dlg.getByPlaceholder(/Escanea o escribe el código — CCB/).fill(l2.code);
    await dlg.getByPlaceholder(/Busca por título, autor o ISBN/).fill(g.title);
    await dlg.getByRole('button', { name: new RegExp(g.title.replace(/[[\]]/g, '\\$&')) }).click();
    await dlg.locator('button[type="submit"]').click();
    await expect(dlg.getByRole('status').filter({ hasText: /Límite alcanzado: 3 reservas activas/ })).toBeVisible();
    await dlg.getByRole('button', { name: 'Cerrar' }).first().click();

    await cancelReservationsOf(l2); // libera los ejemplares apartados para el inventario
  });
});

// =============================================================================
// BIB-02 · Catalogo con datos creados (filtros, estado, hipotesis de busqueda)
// =============================================================================
test.describe('BIB-02 catalogo con datos E2E', () => {
  test('busqueda por [E2E] <runId>, disponibilidad en tabla y vista tarjetas', { tag: '@write' }, async ({ page }) => {
    const a = await title('Alfa');
    const g = await title('Gamma');
    const c1 = await item(6, 'Gamma');
    const l2 = await reader(2);
    await resetReaders();
    const loan = await lend(api, l2.code, c1.code);
    expect(loan.status).toBe(201); // Gamma queda agotado
    await page.goto('/app/biblioteca/catalogo');
    await page.getByLabel('Buscar en el catálogo').fill(tag(''));
    const rowA = page.locator(`[data-row-id="${a.id}"]:visible`);
    const rowG = page.locator(`[data-row-id="${g.id}"]:visible`);
    await expect(rowA).toBeVisible();
    await expect(rowA).toContainText('Disponible');
    await expect(rowA).toContainText('/');
    await expect(rowG).toContainText('Agotado');
    await page.getByRole('button', { name: 'Tarjetas' }).click();
    await expect(page.getByRole('link', { name: new RegExp(a.title.replace(/[[\]]/g, '\\$&')) }).first()).toBeVisible();
    await expect(page.getByText('Agotado').filter({ visible: true }).first()).toBeVisible();
    // enlace a la ficha
    await page.getByRole('link', { name: new RegExp(a.title.replace(/[[\]]/g, '\\$&')) }).first().click();
    await expect(page).toHaveURL(new RegExp(`/titulos/${a.id}$`));
  });

  test('"Solo disponibles" NO debe listar titulos agotados', { tag: '@write' }, async ({ page }) => {
    const g = await title('Gamma');
    await page.goto('/app/biblioteca/catalogo');
    await page.getByLabel('Buscar en el catálogo').fill(tag('Gamma'));
    await expect(page.locator(`[data-row-id="${g.id}"]:visible`)).toContainText('Agotado');
    await page.getByRole('switch').click();
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(900);
    await expect(page.locator(`[data-row-id="${g.id}"]:visible`),
      'con "Solo disponibles" activo sigue apareciendo un titulo cuyas copias estan todas prestadas (Agotado)').toHaveCount(0);
  });

  test('filtro Genero: libro/revista', { tag: '@write' }, async ({ page }) => {
    const a = await title('Alfa');
    await page.goto('/app/biblioteca/catalogo');
    await page.getByLabel('Buscar en el catálogo').fill(tag('Alfa'));
    await expect(page.locator(`[data-row-id="${a.id}"]:visible`)).toBeVisible();
    // El menu solo ofrece generos EXISTENTES en el acervo (facets): hoy solo "Libro".
    await expect(page.getByLabel('Género').locator('option')).toContainText([/Todos/, /Libro \(\d+\)/]);
    await page.getByLabel('Género').selectOption('libro');
    await expect(page.locator(`[data-row-id="${a.id}"]:visible`)).toBeVisible();
    await page.getByRole('button', { name: 'Limpiar' }).click();
    await expect(page.getByLabel('Género')).toHaveValue('');
  });

  test('busqueda tolera acentos ("garcia" encuentra "García Márquez")', { tag: '@write' }, async ({ page }) => {
    const a = await title('Alfa');
    await page.goto('/app/biblioteca/catalogo');
    await page.getByLabel('Buscar en el catálogo').fill('García Márquez');
    await expect(page.locator(`[data-row-id="${a.id}"]:visible`), 'con acento exacto').toBeVisible();
    await page.getByLabel('Buscar en el catálogo').fill('garcia marquez');
    await page.waitForTimeout(900);
    await expect(page.locator(`[data-row-id="${a.id}"]:visible`),
      'la busqueda es LIKE sin unaccent: "garcia" no encuentra "García"').toBeVisible();
  });

  test('export respeta el filtro de busqueda', { tag: '@write' }, async ({ page }) => {
    await page.goto('/app/biblioteca/catalogo');
    await page.getByLabel('Buscar en el catálogo').fill(tag('Alfa'));
    await page.waitForTimeout(700);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('link', { name: 'Exportar' }).click()]);
    const { readFile } = await import('node:fs/promises');
    const buf = await readFile(await dl.path());
    expect(buf[0] === 0x50 && buf[1] === 0x4b).toBe(true);
    expect(buf.length).toBeGreaterThan(2_000);
  });
});

// =============================================================================
// BIB-08 · Inventario sobre el sitio E2E
// =============================================================================
test.describe('BIB-08 inventario', () => {
  test('sesion en el sitio E2E: encontrado / ya escaneado / prestado / fuera de ubicacion / faltante', { tag: '@write' }, async ({ page }) => {
    const inv0 = await api.get<{ active: { id: string; name: string } | null }>('/inventories');
    test.skip(!!inv0.json.active && !inv0.json.active.name.startsWith('[E2E]'),
      'saltado: hay un inventario REAL en progreso (no se toca ni se cierra)');
    const s = await site();
    const a1 = await item(1, 'Alfa'); // sitio -> encontrado
    const b1 = await item(3, 'Beta'); // sitio, prestado -> prestado
    const b2 = await item(4, 'Beta'); // sitio, sin escanear -> faltante
    const b3 = await item(5, 'Beta', false); // sin sitio -> fuera de ubicacion
    const l3 = await reader(3);
    await resetReaders();
    const loan = await lend(api, l3.code, b1.code); // prestado Y escaneado -> aviso en la UI
    expect(loan.status).toBe(201);
    const loan2 = await lend(api, l3.code, b2.code); // prestado y SIN escanear -> resultado "prestado"
    expect(loan2.status).toBe(201);

    // si quedo una sesion E2E abierta de un intento previo, se cierra
    if (inv0.json.active) await api.post(`/inventories/${inv0.json.active.id}/finish`, {});

    await page.goto('/app/biblioteca/inventario');
    await expect(page.getByRole('heading', { level: 1, name: 'Inventario' })).toBeVisible();
    await page.getByRole('button', { name: 'Nuevo inventario' }).first().click();
    const dlg = await dialogOf(page);
    await dlg.getByPlaceholder(/Inventario anual/).fill(tag('Inventario'));
    await dlg.getByLabel('Alcance').selectOption(s.id);
    await dlg.getByRole('button', { name: 'Abrir inventario' }).click();
    await expect(dlg).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: tag('Inventario') })).toBeVisible();
    const now = await api.get<{ active: { id: string; expected: number } }>('/inventories');
    const invId = now.json.active.id;
    ledgerInventory(invId);
    const sites = await api.get<{ sites: Array<{ id: string; items: number }> }>('/sites');
    expect(now.json.active.expected, 'esperados = ejemplares vivos del sitio E2E').toBe(sites.json.sites.find((x) => x.id === s.id)!.items);

    // un segundo inventario en progreso se rechaza
    const dupe = await api.post('/inventories', { name: tag('Inventario duplicado') });
    expect(dupe.status).toBe(409);

    const scan = page.getByLabel('Escanear ejemplar');
    const say = async (code: string, re: RegExp) => {
      await scan.fill(code);
      await scan.press('Enter');
      await expect(page.getByRole('status').filter({ hasText: re }).first()).toBeVisible({ timeout: 15_000 });
    };
    await say(a1.code, /encontrado \(1\/\d+\)/);
    await say(a1.code, /ya estaba escaneado/);
    await say(b1.code, /figura PRESTADO/);
    await say(b3.code, /FUERA DE UBICACIÓN/);
    const bad = await api.post(`/inventories/${invId}/scan`, { inventoryCode: 'E2E-NO-EXISTE-77' });
    expect(bad.status).toBe(404);

    // cierre: A2/C1 sin escanear -> FALTANTES; B2 prestado sin escanear -> prestado; B3 fuera de ubicacion
    await page.getByRole('button', { name: 'Finalizar inventario' }).click();
    await expect(page.getByText(/quedan como FALTANTES/)).toBeVisible();
    await page.getByRole('button', { name: 'Seguir escaneando' }).click();
    await page.getByRole('button', { name: 'Finalizar inventario' }).click();
    await page.getByRole('button', { name: 'Confirmar cierre' }).click();
    await expect(page.getByText('Finalizado').first()).toBeVisible({ timeout: 20_000 });

    const items = await api.get<{ items: Array<{ inventoryCode: string; resultado: string }> }>(`/inventories/${invId}/items?tab=todos&pageSize=50`);
    const by = Object.fromEntries(items.json.items.map((i) => [i.inventoryCode, i.resultado]));
    const a2 = await item(2, 'Alfa');
    const c1 = await item(6, 'Gamma');
    expect(by[a1.code]).toBe('encontrado');
    expect(by[b2.code], 'prestado sin escanear NO es faltante').toBe('prestado');
    expect(by[a2.code]).toBe('faltante');
    expect(by[c1.code]).toBe('faltante');
    // BUG (S1/S2): el ejemplar de OTRO sitio escaneado (B3) debe quedar listado en "Fuera de ubicacion" y
    // contado en el resumen; el alcance por sitio (scopeItems) lo excluye de lista y conteos.
    const fuera = await api.get<{ items: Array<{ inventoryCode: string }> }>(`/inventories/${invId}/items?tab=fuera&pageSize=50`);
    expect.soft(fuera.json.items.map((i) => i.inventoryCode), 'pestana "Fuera de ubicacion" lista el ejemplar de otro sitio escaneado').toContain(b3.code);
    const summary = await api.get<{ previous: Array<{ id: string; misplaced: number; scanned: number }> }>('/inventories');
    const mine = summary.json.previous.find((x) => x.id === invId);
    expect.soft(mine?.misplaced, 'el resumen cuenta 1 ejemplar fuera de ubicacion').toBe(1);

    // exportar el resultado del inventario (xlsx)
    const xl = await ctx.get(`/app/biblioteca/api/inventories/${invId}/export`);
    expect(xl.status()).toBe(200);
    const b = await xl.body();
    expect(b[0] === 0x50 && b[1] === 0x4b, 'xlsx del inventario').toBe(true);

    // finalizar de nuevo -> 409
    const again = await api.post(`/inventories/${invId}/finish`, {});
    expect(again.status).toBe(409);
    await giveBack(b1.code, b2.code);
  });
});
