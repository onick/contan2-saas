// 05-cuenta.spec.ts · Q1 · AUTH-13 (Mi cuenta: sesiones, cerrar otra, cambiar clave y revertir) y AUTH-07 (logout).
// Cuenta: e2e-reset@test.local (operator), con la clave que dejo AUTH-10 (.artifacts/q1/q1-state.json).
// Logins reales: B (otra sesion, para cerrarla desde A) + C (para comprobar que cambiar la clave cierra las demas)
// + A solo si la sesion guardada por AUTH-10 ya no vale. Nada de la cuenta del owner ni de las demas e2e-*.
// La clave de e2e-reset se anota en .artifacts (gitignored) tras cada cambio y vuelve a la original.
import { existsSync } from 'node:fs';
import { request as pwRequest, type BrowserContext } from '@playwright/test';
import { statePath } from '../../fixtures/roles';
import { expect, test } from '../../fixtures/test';
import {
  loginInNewContext,
  newStrongPassword,
  note,
  readState,
  resetSessionFile,
  RESET_EMAIL,
  writeState,
} from '../../support/q1-common';

const EMPTY = { cookies: [], origins: [] };
test.use({ storageState: EMPTY });
test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'logins reales: solo desktop-1440 (rate limit por IP)');
});

async function sessionValid(baseURL: string, file: string): Promise<boolean> {
  if (!existsSync(file)) return false;
  const ctx = await pwRequest.newContext({ baseURL, storageState: file });
  try {
    const r = await ctx.get('/app/cuenta/api/me', { maxRedirects: 0 });
    return r.status() === 200;
  } finally {
    await ctx.dispose();
  }
}

/** Sesion A de e2e-reset: la de AUTH-10 si sigue viva; si no, un login nuevo (cuenta contra el presupuesto). */
async function openSessionA(browser: import('@playwright/test').Browser, baseURL: string): Promise<BrowserContext> {
  const file = resetSessionFile('a');
  if (await sessionValid(baseURL, file)) return browser.newContext({ baseURL, storageState: file });
  const pw = readState().resetPassword;
  if (!pw) throw new Error('sin clave de e2e-reset: AUTH-10 no la dejo (token consumido antes); no se puede abrir sesion');
  const { context } = await loginInNewContext(browser, baseURL, RESET_EMAIL, pw, file, 'AUTH-13 login e2e-reset (sesion A)');
  return context;
}

test.describe('Q1 cuenta', () => {
  test('AUTH-13a Mi cuenta: lista las sesiones y cierra otra sesion propia', { tag: '@write' }, async ({ browser, baseURL }) => {
    const pw = readState().resetPassword;
    test.skip(!pw, 'no reproducible: sin clave de e2e-reset (el token de reset se consumio antes y no hay estado)');

    const a = await openSessionA(browser, baseURL!);
    let b: BrowserContext | undefined;
    try {
      const pageA = await a.newPage();
      await pageA.goto('/app/cuenta');
      await expect(pageA.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeVisible();
      await expect(pageA.getByRole('heading', { name: 'Cambiar contraseña' })).toBeVisible();
      await expect(pageA.getByRole('heading', { name: 'Sesiones activas' })).toBeVisible();
      await expect(pageA.getByText('Esta sesión')).toHaveCount(1, { timeout: 15_000 });

      // Segunda sesion de la misma cuenta (login real #2 de esta cuenta).
      ({ context: b } = await loginInNewContext(browser, baseURL!, RESET_EMAIL, pw!, resetSessionFile('b'), 'AUTH-13 login e2e-reset (sesion B)'));

      await pageA.reload();
      const items = pageA.getByRole('listitem').filter({ has: pageA.getByText(/Iniciada/) });
      await expect(items.first()).toBeVisible();
      const before = await items.count();
      expect(before, 'A y B figuran como sesiones').toBeGreaterThanOrEqual(2);
      const close = pageA.getByRole('button', { name: 'Cerrar', exact: true });
      expect(await close.count(), 'la sesion actual no ofrece "Cerrar"').toBe(before - 1);

      // Cerrar otra sesion desde A: la lista se actualiza y B queda invalidada en servidor.
      await close.first().click();
      await expect(items).toHaveCount(before - 1);
      const meB = await b.request.get('/app/cuenta/api/me', { maxRedirects: 0 });
      expect(meB.status(), 'la sesion cerrada ya no vale').toBe(401);
      // La actual sigue viva.
      await pageA.reload();
      await expect(pageA.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeVisible();
    } finally {
      await b?.close();
      await a.close();
    }
  });

  test('AUTH-13b cambiar contrasena (clave actual mala, exito, cierra las demas) y revertir', { tag: '@write' }, async ({ browser, baseURL }) => {
    const pw = readState().resetPassword;
    test.skip(!pw, 'no reproducible: sin clave de e2e-reset');
    const pw2 = newStrongPassword();

    const a = await openSessionA(browser, baseURL!);
    const { context: c } = await loginInNewContext(browser, baseURL!, RESET_EMAIL, pw!, resetSessionFile('c'), 'AUTH-13 login e2e-reset (sesion C)');
    try {
      const page = await a.newPage();
      await page.goto('/app/cuenta');
      const current = page.getByLabel(/^Contraseña actual/);
      const next = page.getByLabel(/^Contraseña nueva/);
      const rep = page.getByLabel(/^Repetir contraseña nueva/);
      const save = page.getByRole('button', { name: 'Actualizar contraseña' });

      // Clave actual incorrecta: error claro, nada cambia.
      await current.fill(`${pw}-mala`);
      await next.fill(pw2);
      await rep.fill(pw2);
      await save.click();
      await expect(page.getByRole('alert').filter({ hasText: /actual no es correcta/ })).toBeVisible();

      // Cambio real. La clave nueva queda anotada ANTES de enviar (si el test muere, no se pierde la cuenta).
      writeState({ resetPasswordPending: pw2 });
      await current.fill(pw!);
      await next.fill(pw2);
      await rep.fill(pw2);
      await save.click();
      const ok = page.getByRole('status').filter({ hasText: 'Contraseña actualizada' });
      await expect(ok).toBeVisible();
      await expect(ok).toContainText('demás sesiones quedaron cerradas');
      writeState({ resetPassword: pw2 });

      // Las demas sesiones se cerraron; la actual sigue.
      const meC = await c.request.get('/app/cuenta/api/me', { maxRedirects: 0 });
      expect(meC.status(), 'cambiar la clave cierra las otras sesiones').toBe(401);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeVisible();

      // Revertir a la clave original.
      await current.fill(pw2);
      await next.fill(pw!);
      await rep.fill(pw!);
      await save.click();
      await expect(page.getByRole('status').filter({ hasText: 'Contraseña actualizada' })).toBeVisible();
      writeState({ resetPassword: pw });
    } finally {
      await c.close();
      await a.close();
    }
  });

  test('AUTH-07a BUG CONOCIDO: clic con mouse en "Cerrar sesion" del menu de usuario no cierra la sesion', async ({ browser, baseURL }) => {
    // Observado: el clic cierra el menu (Radix) pero el <form> se desmonta antes del submit y nunca sale el POST a
    // /api/auth/logout. Con teclado (Enter) si funciona. Esperado: /login. test.fail: pasa mientras el bug exista.
    test.fail(true, 'Q1-01: TopbarUserMenu desmonta el form antes de que el clic lo envie');
    test.skip(!readState().resetPassword, 'no reproducible: sin clave de e2e-reset');
    const a = await openSessionA(browser, baseURL!);
    try {
      const page = await a.newPage();
      await page.goto('/app');
      await page.getByRole('button', { name: 'Menú de usuario' }).click();
      await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
      await expect(page).toHaveURL(/\/login$/, { timeout: 8_000 });
    } finally {
      await a.close();
    }
  });

  test('AUTH-07 logout con teclado cierra SOLO esta sesion; atras no muestra datos; el token queda revocado', { tag: '@write' }, async ({ browser, baseURL }) => {
    test.skip(!readState().resetPassword, 'no reproducible: sin clave de e2e-reset');
    const a = await openSessionA(browser, baseURL!);
    const fileA = resetSessionFile('a');
    try {
      const page = await a.newPage();
      await page.goto('/app');
      await expect(page).toHaveURL(/\/app$/);
      await page.getByRole('button', { name: 'Menú de usuario' }).click();
      const item = page.getByRole('menuitem', { name: 'Cerrar sesión' });
      await item.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
      const cookies = await a.cookies();
      expect(cookies.find((x) => x.name === 'contan2_session' && x.value), 'cookie limpia tras logout').toBeUndefined();

      // Atras: /app NO debe mostrar datos; termina en /login.
      await page.goBack();
      await expect(page).toHaveURL(/\/login/, { timeout: 20_000 }); // /app (en el historial) redirige a /login
      await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Menú de usuario' })).toHaveCount(0);
    } finally {
      await a.close();
    }

    // Revocada EN SERVIDOR: el token guardado ya no sirve (borrar la cookie no basta).
    const reuse = await pwRequest.newContext({ baseURL, storageState: fileA });
    try {
      expect((await reuse.get('/app/cuenta/api/me', { maxRedirects: 0 })).status(), 'token de la sesion cerrada').toBe(401);
    } finally {
      await reuse.dispose();
    }

    // La sesion compartida del owner (.auth/owner.json) no se toco.
    const shared = await pwRequest.newContext({ baseURL, storageState: statePath('owner') });
    try {
      expect((await shared.get('/app', { maxRedirects: 0 })).status(), '.auth/owner.json sigue valida').toBe(200);
    } finally {
      await shared.dispose();
    }
    note(test.info(), 'dato', 'e2e-reset queda con la clave original de AUTH-10; ninguna sesion abierta tras AUTH-07');
  });
});
