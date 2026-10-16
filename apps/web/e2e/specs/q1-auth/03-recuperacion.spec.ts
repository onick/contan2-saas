// 03-recuperacion.spec.ts · Q1 · AUTH-08 (recuperar), AUTH-09 (token invalido), AUTH-10 (reset valido).
// Presupuesto del limiter compartido forgot/reset (5 / 15 min por IP): AUTH-08 = 1, AUTH-09 = 1,
// AUTH-10 = 1 (valido) + 1 (reuso) = 4. Un login real (cuenta e2e-reset) al final de AUTH-10.
// La contrasena nueva de e2e-reset se genera aqui, se guarda ANTES de enviarla (.artifacts, gitignored)
// y nunca se imprime.
import { expect, test } from '../../fixtures/test';
import {
  loginInNewContext,
  newStrongPassword,
  note,
  readState,
  resetSessionFile,
  resetToken,
  RESET_EMAIL,
  skipConsumed,
  writeState,
} from '../../support/q1-common';
import { expectNoHorizontalOverflow } from '../../support/layout';

const EMPTY = { cookies: [], origins: [] };
test.use({ storageState: EMPTY });
test.describe.configure({ mode: 'serial' });

test.describe('Q1 recuperacion', () => {
  test('AUTH-08 recuperar: respuesta neutra (correo inexistente), una sola vez', { tag: '@write' }, async ({ page }, testInfo) => {
    await page.goto('/recuperar');
    await expect(page.getByRole('heading', { level: 1, name: 'Recuperar contraseña' })).toBeVisible();
    await expectNoHorizontalOverflow(page, `/recuperar ${testInfo.project.name}`);
    await expect(page.getByRole('link', { name: 'Volver a ingresar' })).toBeVisible();
    // El envio cuenta contra el limiter 5/15 min: solo desktop; en otros viewports solo se verifica el render.
    if (testInfo.project.name !== 'desktop-1440') return;

    const unknown = `e2e-nadie-${Date.now().toString(36)}@test.local`;
    await page.getByLabel('Email').fill(unknown);
    const resp = page.waitForResponse((r) => r.url().endsWith('/recuperar/api') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
    const r = await resp;
    expect(r.status(), 'respuesta neutra: 200 aunque la cuenta no exista').toBe(200);
    const status = page.getByRole('status').filter({ hasText: /Revis/ });
    await expect(status).toBeVisible();
    await expect(status).toContainText('Si la cuenta existe');
    await expect(status).not.toContainText(unknown);
    await expect(status).not.toContainText(/no existe|no encontr|no registrad/i);
  });

  test('AUTH-09 reset con token invalido: el formulario valida y la API responde generico', { tag: '@write' }, async ({ page }, testInfo) => {
    await page.goto('/reset/token-inventado-que-no-existe');
    await expect(page.getByRole('heading', { level: 1, name: 'Contraseña nueva' })).toBeVisible();
    await expectNoHorizontalOverflow(page, `/reset ${testInfo.project.name}`);
    // El envio cuenta contra el limiter 5/15 min: solo desktop; en otros viewports solo se verifica el render.
    if (testInfo.project.name !== 'desktop-1440') return;

    const pw = page.getByLabel(/^Contraseña nueva/);
    const pw2 = page.getByLabel(/^Repetir contraseña/);
    const submit = page.getByRole('button', { name: 'Guardar contraseña nueva' });

    // Validacion nativa: menos de 10 caracteres no se envia (sin pegarle a la API).
    let posted = 0;
    page.on('request', (rq) => {
      if (rq.url().endsWith('/reset/api')) posted++;
    });
    await pw.fill('corta');
    await pw2.fill('corta');
    await submit.click();
    expect(await pw.evaluate((el) => (el as HTMLInputElement).validity.tooShort), 'minLength=10').toBe(true);
    // Contrasenas distintas: error del cliente, sin API.
    await pw.fill('Distinta-Clave-123');
    await pw2.fill('Otra-Clave-12345');
    await submit.click();
    await expect(page.getByRole('alert').filter({ hasText: 'no coinciden' })).toBeVisible();
    expect(posted, 'las validaciones de cliente no llegan a la API').toBe(0);

    // Token inventado: la API responde con mensaje generico (400), sin revelar si el token existio.
    await pw2.fill('Distinta-Clave-123');
    const resp = page.waitForResponse((r) => r.url().endsWith('/reset/api'));
    await submit.click();
    const r = await resp;
    expect(r.status()).toBe(400);
    const alert = page.getByRole('alert').filter({ hasText: /Token inv/ });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('expirado');
  });

  test('AUTH-10 reset valido con el token sembrado; no se reutiliza; login con la clave nueva', { tag: '@write' }, async ({ page, browser, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'reset real: un solo viewport');
    const st = readState();
    const token = resetToken();
    test.skip(!token, 'sin E2E_RESET_TOKEN');
    if (st.resetTokenConsumed) {
      skipConsumed(testInfo, 'AUTH-10');
      test.skip(true, 'no reproducible: token de reset consumido');
    }

    const pw = newStrongPassword();
    // La clave se guarda ANTES de enviar: si algo muere a mitad, la cuenta no queda sin clave conocida.
    writeState({ resetPasswordPending: pw });

    await page.goto(`/reset/${token}`);
    await page.getByLabel(/^Contraseña nueva/).fill(pw);
    await page.getByLabel(/^Repetir contraseña/).fill(pw);
    const resp = page.waitForResponse((r) => r.url().endsWith('/reset/api'));
    await page.getByRole('button', { name: 'Guardar contraseña nueva' }).click();
    const r = await resp;
    if (r.status() === 400) {
      // Token ya usado/expirado por una corrida previa que no dejo estado: no se fuerza.
      writeState({ resetTokenConsumed: true });
      skipConsumed(testInfo, 'AUTH-10');
      test.skip(true, 'no reproducible: el token ya no es valido (consumido o vencido)');
    }
    expect(r.status(), 'reset valido').toBe(200);
    writeState({ resetPassword: pw, resetTokenConsumed: true });
    const done = page.getByRole('status').filter({ hasText: 'Contraseña actualizada' });
    await expect(done).toBeVisible();
    await expect(done).toContainText('cerramos todas tus sesiones');

    // El token es de un solo uso: el mismo enlace ya no sirve.
    await page.goto(`/reset/${token}`);
    await page.getByLabel(/^Contraseña nueva/).fill('Otra-Clave-Distinta-77');
    await page.getByLabel(/^Repetir contraseña/).fill('Otra-Clave-Distinta-77');
    const resp2 = page.waitForResponse((x) => x.url().endsWith('/reset/api'));
    await page.getByRole('button', { name: 'Guardar contraseña nueva' }).click();
    expect((await resp2).status(), 'token reutilizado').toBe(400);
    await expect(page.getByRole('alert').filter({ hasText: /Token inv/ })).toBeVisible();

    // Login real con la clave nueva (cuenta 1): sesion A para 05-cuenta.
    const { context, page: p } = await loginInNewContext(
      browser,
      baseURL!,
      RESET_EMAIL,
      pw,
      resetSessionFile('a'),
      'AUTH-10 login e2e-reset (clave nueva)',
    );
    try {
      await expect(p).toHaveURL(/\/app/);
      note(testInfo, 'dato', 'e2e-reset: clave cambiada por AUTH-10 (ver .artifacts/<runId>/q1-credentials.json)');
    } finally {
      await context.close();
    }
  });
});
