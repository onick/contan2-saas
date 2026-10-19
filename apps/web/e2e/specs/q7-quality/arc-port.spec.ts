// arc-port.spec.ts · Porte Arc 1: DateRangePicker (Reportes y Puerta/reportes), OtpInput (PIN del escáner),
// NumberField (Puerta), SplitButton (Reportes y Biblioteca) y movimiento del DropdownMenu del kit.
// SOLO LECTURA: abre y cierra overlays, navega y tipea; nunca envía el PIN ni registra entradas.
import { expect, test } from '../../fixtures/test';
import { gotoSettled } from '../../support/q7-common';

const EMPTY = { cookies: [], origins: [] };
const HYDRATION = /Minified React error #4(18|23|25)|Hydration failed|did not match|hydrat/i;

// ───────────────────────────────────────────────────────────────────────────────
// Rutas tocadas por el porte: cargan sin errores de hidratación (#418/#423/#425).
// ───────────────────────────────────────────────────────────────────────────────
test.describe('arc · rutas sin errores de hidratación', () => {
  for (const route of ['/app/reportes', '/app/puerta/reportes', '/app/biblioteca/catalogo', '/app/usuarios', '/app/puerta', '/app/check-in'] as const) {
    test(`ARC-00 ${route} carga sin #418`, async ({ page, consoleErrors }) => {
      await gotoSettled(page, route);
      await expect(page).not.toHaveURL(/\/login/);
      expect(consoleErrors.filter((e) => HYDRATION.test(e)), `errores de hidratación en ${route}`).toEqual([]);
    });
  }
  test('ARC-00 /scanner y /kiosko (sin sesión) cargan sin #418', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: EMPTY });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    for (const route of ['/scanner', '/kiosko']) await gotoSettled(page, route);
    expect(errors.filter((e) => HYDRATION.test(e))).toEqual([]);
    await ctx.close();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// A · DateRangePicker en Reportes
// ───────────────────────────────────────────────────────────────────────────────
test.describe('arc · DateRangePicker en Reportes', () => {
  test('ARC-A1 trigger hidratado, Enter abre con foco en un día, Escape devuelve el foco', async ({ page }) => {
    await gotoSettled(page, '/app/reportes');
    const trigger = page.getByRole('button', { name: /^Período:/ });
    await expect(trigger).toBeEnabled();
    await expect(trigger).toHaveAttribute('aria-label', /^Período: Este mes/);
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Período' });
    await expect(dialog).toBeVisible();
    const focused = page.locator(':focus');
    await expect(focused, 'el foco cae en el día tabbable').toHaveAttribute('data-date', /^\d{4}-\d{2}-\d{2}$/);
    const before = await focused.getAttribute('data-date');
    await page.keyboard.press('ArrowLeft');
    const after = await page.locator(':focus').getAttribute('data-date');
    expect(after, 'ArrowLeft mueve el foco un día atrás').not.toBe(before);
    // El panel no se sale de la pantalla (390 incluido).
    const box = await dialog.boundingBox();
    const vw = page.viewportSize()!.width;
    expect(box, 'bounding box del panel').not.toBeNull();
    expect(box!.x, 'borde izquierdo del panel').toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, 'borde derecho del panel').toBeLessThanOrEqual(vw + 1);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('ARC-A2 preset "Últimos 30 días" + Aplicar → URL; recarga conserva; from inválido cae a "Este mes"', async ({ page }) => {
    await gotoSettled(page, '/app/reportes');
    const trigger = page.getByRole('button', { name: /^Período:/ });
    await expect(trigger).toBeEnabled();
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Período' });
    const preset = dialog.getByRole('button', { name: 'Últimos 30 días' });
    await preset.click();
    await expect(preset).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Aplicar' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/[?&]preset=30d/);
    await expect(page).toHaveURL(/[?&]from=\d{4}-\d{2}-\d{2}/);
    await expect(page).toHaveURL(/[?&]to=\d{4}-\d{2}-\d{2}/);
    await expect(trigger).toHaveAttribute('aria-label', /^Período: Últimos 30 días/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^Período: Últimos 30 días/ })).toBeEnabled();
    await gotoSettled(page, '/app/reportes?from=zzz&to=2026-99-99');
    await expect(page.getByRole('button', { name: /^Período: Este mes/ })).toBeEnabled();
  });

  test('ARC-A3 Puerta/reportes usa el mismo selector', async ({ page }) => {
    await gotoSettled(page, '/app/puerta/reportes');
    await expect(page).not.toHaveURL(/\/login/);
    const trigger = page.getByRole('button', { name: /^Período:/ });
    await expect(trigger).toBeEnabled();
    await trigger.click();
    await expect(page.getByRole('dialog', { name: 'Período' })).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// D · SplitButton (Reportes, Biblioteca) y movimiento del DropdownMenu
// ───────────────────────────────────────────────────────────────────────────────
test.describe('arc · SplitButton y DropdownMenu', () => {
  test('ARC-D1 Reportes: "Descargar PDF" sigue siendo link; el gatillo abre el panel "Descargas" y Escape devuelve el foco', async ({ page }) => {
    await gotoSettled(page, '/app/reportes');
    const pdf = page.getByRole('link', { name: 'Descargar PDF' });
    await expect(pdf).toBeVisible();
    await expect(pdf).toHaveAttribute('href', /\/app\/reportes\/api\/period\?kind=pdf/);
    const trigger = page.getByRole('button', { name: 'Otros formatos de exportación' });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByRole('dialog', { name: 'Descargas' });
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByRole('heading', { name: 'Informe del período' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Excel · Informe del período' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('ARC-D2 Biblioteca: "Agregar libro" navega; "Manual" deja el foco en Título', async ({ page }) => {
    await gotoSettled(page, '/app/biblioteca/catalogo');
    await expect(page).not.toHaveURL(/\/login/);
    const cta = page.getByRole('link', { name: /Agregar libro/ }).first();
    test.skip(!(await cta.count()), 'catálogo vacío: el CTA de estado vacío es un Button (fuera de este caso)');
    await expect(cta).toHaveAttribute('href', '/app/biblioteca/titulos/nuevo');
    await page.getByRole('button', { name: 'Más formas de agregar un libro' }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Por ISBN (autocompletar)' })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Manual' }).click();
    await expect(page).toHaveURL(/\/app\/biblioteca\/titulos\/nuevo\?modo=manual/);
    await expect(page.getByLabel(/^Título/)).toBeFocused();
  });

  test('ARC-D3 menú del avatar: clase arc-menu, "Cerrar sesión" en tono danger; con reduced motion sin transición', async ({ page }) => {
    await gotoSettled(page, '/app');
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveClass(/arc-menu/);
    const logout = menu.getByRole('menuitem', { name: /Cerrar sesión/ });
    await expect(logout).toHaveAttribute('data-tone', 'danger');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await expect(menu).toBeVisible();
    const durations = await menu.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { transition: cs.transitionDuration, animation: cs.animationDuration, transform: cs.transform };
    });
    expect(durations.transition.split(',').every((d) => d.trim() === '0s'), `transitionDuration=${durations.transition}`).toBe(true);
    expect(durations.animation.split(',').every((d) => d.trim() === '0s'), `animationDuration=${durations.animation}`).toBe(true);
    await page.keyboard.press('Escape');
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// C · NumberField en Puerta (tope 10 con aviso; sigue enfocable)
// ───────────────────────────────────────────────────────────────────────────────
test.describe('arc · NumberField', () => {
  test('ARC-C1 Puerta: acompañantes hasta 10, aviso "Máximo 10", ↓ y Home con teclado', async ({ page }) => {
    await gotoSettled(page, '/app/puerta');
    await page.getByRole('button', { name: /Registrar entrada/ }).first().click();
    const dlg = page.getByRole('dialog');
    const mas = dlg.getByRole('button', { name: 'Más acompañantes' });
    const menos = dlg.getByRole('button', { name: 'Menos acompañantes' });
    await expect(menos).toBeDisabled(); // en 0: aria-disabled
    for (let i = 0; i < 10; i++) await mas.click();
    await expect(mas).toBeDisabled();
    await expect(dlg.getByText('Máximo 10')).toBeVisible();
    const spin = dlg.getByRole('spinbutton', { name: /acompañantes/i });
    await expect(spin).toHaveAttribute('aria-valuenow', '10');
    await spin.focus();
    await page.keyboard.press('ArrowDown');
    await expect(spin).toHaveAttribute('aria-valuenow', '9');
    await expect(dlg.getByText('Máximo 10')).toBeHidden();
    await page.keyboard.press('Home');
    await expect(spin).toHaveAttribute('aria-valuenow', '0');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// B · OtpInput en el PIN del escáner (sin enviar: límite 8/min por IP)
// ───────────────────────────────────────────────────────────────────────────────
test.describe('arc · OtpInput', () => {
  test.use({ storageState: EMPTY });
  test('ARC-B1 /scanner: un input real, casillas aria-hidden, pegado saneado, Backspace de a uno', async ({ page }) => {
    await gotoSettled(page, '/scanner');
    const pin = page.getByLabel('PIN del centro');
    await expect(pin).toBeVisible();
    await expect(pin).toHaveAttribute('inputmode', 'numeric');
    await expect(pin).toBeFocused();
    await expect(page.locator('input[aria-label="PIN del centro"]')).toHaveCount(1);
    const slots = page.locator('.arc-otp-slots[aria-hidden="true"] > *');
    expect(await slots.count()).toBeGreaterThanOrEqual(4);
    await pin.fill('12 34');
    await expect(pin).toHaveValue('1234');
    await expect(page.locator('.arc-otp-slots > [data-filled="true"]')).toHaveCount(4);
    await page.keyboard.press('Backspace');
    await expect(pin).toHaveValue('123');
    await expect(page.locator('.arc-otp-slots > [data-filled="true"]')).toHaveCount(3);
    await pin.fill('');
    await expect(page.locator('.arc-otp-slots > [data-filled="true"]')).toHaveCount(0);
  });
});
