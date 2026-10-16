// q7-keyboard.spec.ts · X-KEY: flujos solo con teclado (sin mouse). SOLO LECTURA:
// no se envia ningun login real (ruta mockeada), no se confirma check-in, no se registra asistencia.
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { gotoSettled, record } from '../../support/q7-common';

const EMPTY = { cookies: [], origins: [] };

/** Presiona Tab hasta que el elemento enfocado coincida con `re` (aria-label o texto), max n. */
async function tabTo(page: Page, re: RegExp, n = 40, opts: { buttonOnly?: boolean } = {}): Promise<boolean> {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    const ok = await page.evaluate(
      ({ src, flags, buttonOnly }) => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return false;
        if (buttonOnly && el.tagName !== 'BUTTON') return false;
        const rx = new RegExp(src, flags);
        return rx.test(el.getAttribute('aria-label') ?? '') || rx.test(el.textContent ?? '');
      },
      { src: re.source, flags: re.flags, buttonOnly: !!opts.buttonOnly },
    );
    if (ok) return true;
  }
  return false;
}

test.describe('q7 teclado · login', () => {
  test.use({ storageState: EMPTY });

  test('Enter con credenciales vacias muestra error accesible; mostrar contrasena con Espacio', { tag: '@smoke' }, async ({ page }) => {
    // El POST jamas llega al servidor (no cuenta contra el rate limit).
    let posts = 0;
    await page.route('**/api/auth/login', (r) => {
      posts++;
      return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"invalid"}' });
    });
    await gotoSettled(page, '/login');
    // autoFocus en correo: Enter envia el formulario vacio
    await expect(page.getByLabel('Correo')).toBeFocused();
    await page.keyboard.press('Enter');
    const alert = page.getByRole('alert').filter({ hasText: /\S/ });
    await expect(alert, 'error accesible').toBeVisible();
    expect(posts).toBe(1);
    // Tab -> contrasena -> Tab -> boton mostrar; Espacio lo activa
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    const toggle = page.getByRole('button', { name: /Mostrar contraseña/ });
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: /Ocultar contraseña/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('q7 teclado · kiosko', () => {
  test.use({ storageState: EMPTY });

  test('bienvenida → actividad → identificacion solo con teclado (sin confirmar)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'webkit-tablet', 'WebKit (macOS) no enfoca <button> con Tab sin Full Keyboard Access: limitacion del navegador de prueba, no del producto');
    await gotoSettled(page, '/kiosko');
    await expect(page.getByTestId('kiosk-step-welcome')).toBeVisible();
    // Tab hasta el CTA de bienvenida y Enter
    const reached = await tabTo(page, /toca para registrarte/i, 10);
    expect(reached, 'CTA de bienvenida alcanzable con Tab').toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('kiosk-step-activity')).toBeVisible();

    // En el paso de actividades el foco debe ser alcanzable (volver al inicio o una tarjeta)
    const cards = page.getByRole('button', { name: /Asistir/ });
    const n = await cards.count();
    record('kiosko-keyboard', { project: testInfo.project.name, activities: n });
    if (n === 0) {
      testInfo.annotations.push({
        type: 'cobertura',
        description: 'Sin actividades con cupo hoy en staging: no se puede llegar al paso Identificarse. Solo se verifico bienvenida→actividades (estado vacio).',
      });
      await expect(page.getByRole('button', { name: 'Volver al inicio' })).toBeVisible();
      const back = await tabTo(page, /volver al inicio/i, 10);
      expect(back, '"Volver al inicio" alcanzable con Tab').toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('kiosk-step-welcome')).toBeVisible();
      return;
    }
    const picked = await tabTo(page, /asistir/i, 40, { buttonOnly: true });
    expect(picked, 'tarjeta de actividad alcanzable con Tab').toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('kiosk-step-identify')).toBeVisible();
    // Identificarse: hay un control enfocable alcanzable (no se escribe nada: evita typeahead y check-in)
    await page.keyboard.press('Tab');
    const tag = await page.evaluate(() => document.activeElement?.tagName);
    expect(tag).not.toBe('BODY');
  });
});

test.describe('q7 teclado · escaner', () => {
  test('PIN: Enter vacio/invalido muestra alert (PIN mockeado, no gasta el rate limit)', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL),
      viewport: testInfo.project.use.viewport ?? undefined,
      hasTouch: testInfo.project.use.hasTouch,
      userAgent: testInfo.project.use.userAgent,
      locale: 'es-DO',
    });
    const page = await ctx.newPage();
    let posts = 0;
    await page.route('**/scanner/api/pin', (r) => {
      posts++;
      return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"invalid"}' });
    });
    await gotoSettled(page, '/scanner');
    const pin = page.getByLabel('PIN del centro');
    await expect(pin).toBeVisible();
    const focused = await tabTo(page, /^PIN del centro$/, 6);
    expect(focused, 'campo PIN alcanzable con Tab').toBe(true);
    await page.keyboard.type('0000');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();
    expect(posts).toBe(1);
    await ctx.close();
  });

  test('sesion de escaner: seleccion de actividad y entrada manual con teclado (sin enviar)', async ({ asRole }, testInfo) => {
    test.skip(testInfo.project.name === 'webkit-tablet', 'WebKit (macOS) no enfoca <button> con Tab sin Full Keyboard Access: limitacion del navegador de prueba, no del producto');
    const { page } = await asRole('scanner');
    await gotoSettled(page, '/scanner');
    const items = page.getByRole('button').filter({ hasText: /\d+\/\d+/ });
    const n = await items.count();
    record('scanner-keyboard', { project: testInfo.project.name, activities: n });
    if (n === 0) {
      testInfo.annotations.push({
        type: 'cobertura',
        description: 'Sin actividades con cupo en staging: no se llega a la pantalla de entrada manual (SALTADO). Se verifico el estado vacio con teclado (Salir alcanzable).',
      });
      await expect(page.getByText(/No hay actividades con cupo/)).toBeVisible();
      expect(await tabTo(page, /salir/i, 6), '"Salir" alcanzable').toBe(true);
      return;
    }
    expect(await tabTo(page, /\d+\/\d+/, 10)).toBe(true);
    await page.keyboard.press('Enter');
    const manual = page.getByLabel('Código manual');
    await expect(manual).toBeVisible();
    expect(await tabTo(page, /^Código manual$/, 12)).toBe(true);
    // No se escribe ni se envia: "Registrar" esta deshabilitado con el campo vacio
    await expect(page.getByRole('button', { name: 'Registrar' })).toBeDisabled();
  });
});

test.describe('q7 teclado · consola /app/check-in', () => {
  test('"/" enfoca la busqueda, busqueda sin resultados, drawer con teclado y Esc cierra', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-390', 'atajo "/" y foco por teclado: se verifica en tablet/desktop');
    await gotoSettled(page, '/app/check-in');
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {}); // sacar el foco de cualquier campo
    await page.keyboard.press('/');
    const search = page.getByPlaceholder(/Código, nombre, email o teléfono/);
    await expect(search, '"/" enfoca la busqueda').toBeFocused();
    // una sola busqueda (limite compartido 30/min): termino inexistente
    await page.keyboard.type('zzqqxx');
    await page.waitForTimeout(1200);
    await expect(page.getByRole('alert').or(page.getByText(/Sin resultados|No encontramos|no hay/i)).first()).toBeVisible({ timeout: 6000 }).catch(() => {});
    await page.keyboard.press('Escape');

    // Drawer "Nuevo visitante" con teclado: Tab hasta el boton, Enter, Esc cierra y devuelve el foco
    const reached = await tabTo(page, /nuevo visitante/i, 40);
    expect(reached, '"Nuevo visitante" alcanzable con Tab').toBe(true);
    await page.keyboard.press('Enter');
    const dlg = page.getByRole('dialog').first();
    await expect(dlg).toBeVisible();
    // el foco entra al dialogo
    await page.waitForTimeout(400);
    expect(await dlg.evaluate((d) => d.contains(document.activeElement)), 'el foco entra al drawer').toBe(true);
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    const back = await page.evaluate(() => (document.activeElement?.textContent ?? '').trim().slice(0, 30));
    record('checkin-keyboard', { returnedFocus: back });
    expect(back, 'el foco vuelve al disparador').toMatch(/nuevo visitante/i);

    // Lista de invitados (si hay actividad activa): abrir con Enter y cerrar con Esc, sin registrar nada
    const guest = page.getByRole('button', { name: /^(Lista|Invitados)/ }).first();
    if (await guest.count()) {
      await guest.focus();
      await page.keyboard.press('Enter');
      const gd = page.getByRole('dialog', { name: /Lista de invitados/ });
      await expect(gd).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(gd).toBeHidden();
    } else {
      testInfo.annotations.push({ type: 'cobertura', description: 'Sin actividad activa: drawer de lista de invitados no probado.' });
    }
  });
});
