// q5 · Biblioteca · BIB-01 (shell/Inicio) y BIB-02 (catalogo) -- rol `biblioteca`, staging.
// Casi todo es lectura; el unico dato que escribe es 1 titulo [E2E] "largo" (sin ejemplares) para
// verificar titulos completos en movil 390.
import { expect, test } from '../../fixtures/test';
import { statePath } from '../../fixtures/roles';
import { checkA11y } from '../../support/a11y';
import { expectNoHorizontalOverflow } from '../../support/layout';
import { BibApi, createTitle } from '../../support/q5-biblio';

test.use({ storageState: statePath('biblioteca') });

const TABS: Array<[string, string, RegExp]> = [
  ['Inicio', 'Biblioteca', /\/app\/biblioteca$/],
  ['Catálogo', 'Catálogo', /\/app\/biblioteca\/catalogo$/],
  ['Lectores', 'Lectores', /\/app\/biblioteca\/lectores$/],
  ['Préstamos', 'Préstamos', /\/app\/biblioteca\/circulacion$/],
  ['Reservas', 'Reservas', /\/app\/biblioteca\/reservas$/],
  ['Inventario', 'Inventario', /\/app\/biblioteca\/inventario$/],
];

test.describe('BIB-01 shell e Inicio', () => {
  test('Inicio: encabezado, 4 KPI y sub-navegacion de 6 secciones', { tag: '@smoke' }, async ({ page, consoleErrors }) => {
    const res = await page.goto('/app/biblioteca');
    expect(res?.status()).toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeVisible();
    for (const k of ['Títulos', 'Ejemplares', 'En buen estado', 'Sitios físicos']) {
      await expect(page.getByText(k, { exact: true }).first(), `KPI ${k}`).toBeVisible();
    }
    const nav = page.getByRole('navigation', { name: 'Secciones de Biblioteca' });
    await expect(nav.getByRole('link')).toHaveCount(6);
    await expect(nav.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'Escanear ISBN' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nuevo préstamo' })).toBeVisible();
    await expectNoHorizontalOverflow(page, '/app/biblioteca');
    expect(consoleErrors.filter((e) => !/favicon|Failed to load resource.*(_next|image)/i.test(e)), 'errores de consola').toEqual([]);
  });

  test('cada pestana navega, marca aria-current y renderiza su h1', async ({ page }, testInfo) => {
    await page.goto('/app/biblioteca');
    const nav = page.getByRole('navigation', { name: 'Secciones de Biblioteca' });
    for (const [label, h1, url] of TABS) {
      await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(page, `URL de ${label}`).toHaveURL(url);
      await expect(page.getByRole('heading', { level: 1, name: h1 }).first(), `h1 de ${label}`).toBeVisible();
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
      await expectNoHorizontalOverflow(page, `${testInfo.project.name} ${label}`);
    }
  });

  // axe limitado a <main>: los hallazgos del shell (sidebar/topbar) son de Q7, no del modulo.
  for (const [name, url, h1] of [
    ['inicio', '/app/biblioteca', 'Biblioteca'],
    ['catalogo', '/app/biblioteca/catalogo', 'Catálogo'],
    ['lectores', '/app/biblioteca/lectores', 'Lectores'],
    ['prestamos', '/app/biblioteca/circulacion', 'Préstamos'],
    ['reservas', '/app/biblioteca/reservas', 'Reservas'],
    ['inventario', '/app/biblioteca/inventario', 'Inventario'],
  ] as const) {
    test(`a11y axe (critical/serious) en ${name}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-1440', 'axe solo en desktop');
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1, name: h1 }).first()).toBeVisible();
      await page.waitForTimeout(800);
      await checkA11y(page, testInfo, { name: `biblioteca-${name}`, include: ['main'] });
    });
  }

  test('el rol biblioteca queda confinado: /app/usuarios redirige a /app/biblioteca', async ({ page }) => {
    await page.goto('/app/usuarios');
    await expect(page).toHaveURL(/\/app\/biblioteca/);
  });
});

test.describe('BIB-02 catalogo (lectura)', () => {
  test('lista: tabla con columnas, contador, vistas Tabla/Tarjetas y sin overflow', { tag: '@smoke' }, async ({ page }, testInfo) => {
    await page.goto('/app/biblioteca/catalogo');
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeVisible();
    await expect(page.getByText(/\d+ registros?/)).toBeVisible();
    const desktop = testInfo.project.name === 'desktop-1440';
    if (desktop) {
      const table = page.getByRole('table', { name: 'Catálogo de títulos' });
      await expect(table).toBeVisible();
      for (const h of ['Libro', 'ISBN', 'Género', 'Disponibles', 'Estado']) {
        await expect(table.getByRole('columnheader', { name: h })).toBeVisible();
      }
    }
    // Toggle de vista (accesible por nombre + aria-pressed)
    const tarjetas = page.getByRole('button', { name: 'Tarjetas' });
    await tarjetas.click();
    await expect(tarjetas).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Tabla' }).click();
    await expect(page.getByRole('button', { name: 'Tabla' })).toHaveAttribute('aria-pressed', 'true');
    await expectNoHorizontalOverflow(page, `catalogo ${testInfo.project.name}`);
  });

  test('busqueda: sin resultados muestra estado vacio y "Limpiar" restaura', async ({ page }) => {
    await page.goto('/app/biblioteca/catalogo');
    const buscar = page.getByLabel('Buscar en el catálogo');
    await buscar.fill('zzzz-no-existe-e2e-xyz');
    await expect(page.getByText('Sin resultados').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/^0 registros$/)).toBeVisible();
    await page.getByRole('button', { name: 'Limpiar' }).click();
    await expect(buscar).toHaveValue('');
    await expect(page.getByText(/^[1-9]\d* registros?$/)).toBeVisible();
  });

  test('exportar .xlsx devuelve un archivo xlsx valido', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'export solo desktop');
    await page.goto('/app/biblioteca/catalogo');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('link', { name: 'Exportar' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/catalogo_biblioteca.*\.xlsx$/i);
    const { readFile } = await import('node:fs/promises');
    const buf = await readFile(await dl.path());
    expect(buf[0] === 0x50 && buf[1] === 0x4b, 'firma zip (PK) de xlsx').toBe(true);
    expect(buf.length).toBeGreaterThan(2_000);
  });

  test('"Importar" del catalogo tiene accion real (no boton muerto)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'solo desktop');
    await page.goto('/app/biblioteca/catalogo');
    const imp = page.getByRole('button', { name: 'Importar' });
    await expect(imp).toBeVisible();
    const before = page.url();
    await imp.click();
    await page.waitForTimeout(600);
    const opened = await page.getByRole('dialog').count();
    expect(opened > 0 || page.url() !== before || (await page.getByText(/pronto|próximamente/i).count()) > 0,
      'el boton "Importar" no hace nada ni indica "Pronto" (boton muerto)').toBe(true);
  });
});

test.describe('BIB-02 movil 390: titulos completos', () => {
  test('un titulo largo se muestra completo en la tarjeta movil', { tag: '@write' }, async ({ page, playwright }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'solo movil');
    const ctx = await playwright.request.newContext({ baseURL: String(testInfo.project.use.baseURL), storageState: statePath('biblioteca') });
    const api = new BibApi(ctx);
    // Reutiliza un titulo largo [E2E] previo; si no hay, lo crea (los titulos no se pueden borrar por API).
    const probe = await api.get<{ titles: Array<{ id: string; title: string }> }>('/titles?q=' + encodeURIComponent('[E2E]') + '&pageSize=50');
    let long = probe.json.titles.find((t) => t.title.includes('TITULO-LARGO-MOVIL'));
    if (!long) {
      const name = `TITULO-LARGO-MOVIL Tratado integral sobre la conservación, restauración y catalogación de materiales bibliográficos históricos del Caribe`;
      const made = await createTitle(api, name);
      long = { id: made.id, title: made.title };
    }
    await ctx.dispose();
    expect(long.title.length, 'el titulo de prueba debe ser realmente largo').toBeGreaterThan(100);

    await page.goto('/app/biblioteca/catalogo');
    await page.getByLabel('Buscar en el catálogo').fill('TITULO-LARGO-MOVIL');
    const card = page.locator(`li[data-row-id="${long.id}"]`);
    await expect(card).toBeVisible();
    const p = card.locator('p').first();
    await expect(p).toContainText('TITULO-LARGO-MOVIL');
    const m = await p.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, text: el.textContent ?? '' }));
    expect(m.text.includes('Caribe'), 'el texto completo esta en el DOM').toBe(true);
    expect(m.sh, `titulo recortado visualmente (scrollHeight ${m.sh} > clientHeight ${m.ch}): line-clamp-3 oculta el final del titulo`).toBeLessThanOrEqual(m.ch + 1);
    await expectNoHorizontalOverflow(page, 'catalogo movil con titulo largo');
    await testInfo.attach('catalogo-movil-titulo-largo.png', { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
  });
});
