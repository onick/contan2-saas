// 04-invitacion.spec.ts · Q1 · AUTH-11 (invitacion valida) y AUTH-12 (invalida / ya usada).
// Limiter de aceptacion: 10 / hora por IP. AUTH-12 = 1 envio de reuso; AUTH-11 (si el token sigue valido) = 1.
// Cuenta de la invitacion: e2e-invitado@test.local (rol operator). Un login real (AUTH-11b) al final.
// Si el token sembrado ya fue consumido antes de esta corrida (Q0 u otra), AUTH-11 se reporta como
// "no reproducible: token consumido" y no se fuerza; AUTH-12 y AUTH-11b siguen verificando el resultado.
import path from 'node:path';
import { env } from '../../env';
import { expect, test } from '../../fixtures/test';
import { expectNoHorizontalOverflow } from '../../support/layout';
import {
  inviteEmail,
  inviteToken,
  loginInNewContext,
  newStrongPassword,
  note,
  Q1_DIR,
  readState,
  skipConsumed,
  writeState,
} from '../../support/q1-common';

const EMPTY = { cookies: [], origins: [] };
test.use({ storageState: EMPTY });
test.describe.configure({ mode: 'serial' });

test.describe('Q1 invitacion', () => {
  test('AUTH-12 invitacion inexistente: estado honesto, sin formulario', async ({ page }, testInfo) => {
    // Desde PR-16: 404 real con app/invite/[token]/not-found.tsx (copy neutro, igual para inexistente/usada/revocada/vencida).
    const res = await page.goto('/invite/token-inventado-que-no-existe');
    expect(res?.status(), 'status de una invitacion inexistente').toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Invitación' })).toBeVisible();
    const alert = page.getByRole('alert').filter({ hasText: /no es válida/ });
    await expect(alert).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear mi cuenta' })).toHaveCount(0);
    await expect(page.getByLabel(/^Contraseña/)).toHaveCount(0);
    await expectNoHorizontalOverflow(page, `/invite invalida ${testInfo.project.name}`);
  });

  test('AUTH-11 invitacion valida crea la cuenta con rol (si el token sigue pendiente)', { tag: '@write' }, async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'aceptacion real: un solo viewport');
    const token = inviteToken();
    test.skip(!token, 'sin E2E_INVITE_TOKEN');
    const email = inviteEmail();
    const password = env('E2E_INVITE_PASSWORD') || newStrongPassword();

    await page.goto(`/invite/${token}`);
    const used = await page.getByText(/ya fue usada|no encontrada|no es válida/).count();
    if (readState().inviteConsumed || used) {
      writeState({ inviteConsumed: true });
      skipConsumed(testInfo, 'AUTH-11');
      // AUTH-12 con el token realmente usado: estado honesto, sin formulario, y la API tampoco lo acepta.
      await expect(page.getByRole('alert').filter({ hasText: /ya fue usada|expir|no es válida/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Crear mi cuenta' })).toHaveCount(0);
      const again = await request.post('/invite/api', { data: { token, password: newStrongPassword(), fullName: 'Intruso' } });
      expect(again.status(), 'reuso del token de invitacion').toBe(410);
      const msg = (await again.json()) as { error?: string };
      if (/accepted|revoked|expired/.test(msg.error ?? '')) {
        note(testInfo, 'hallazgo-S3', 'POST /invite/api devuelve el estado interno en ingles en el error (410 "Invitación accepted")');
      }
      test.skip(true, 'no reproducible: token de invitacion consumido antes de esta corrida (AUTH-12 verificado con ese token)');
    }

    // Vista previa: organizacion, correo y rol visibles.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Súmate a');
    await expect(page.getByText(email, { exact: false })).toContainText('Operador');
    await expect(page.getByLabel('Tu nombre')).not.toHaveValue('');

    // Validacion de cliente: contrasenas distintas.
    await page.getByLabel(/^Contraseña/).fill(password);
    await page.getByLabel(/^Repetir contraseña/).fill(`${password}x`);
    await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'no coinciden' })).toBeVisible();

    await page.getByLabel(/^Repetir contraseña/).fill(password);
    const resp = page.waitForResponse((r) => r.url().endsWith('/invite/api') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
    expect((await resp).status(), 'aceptar invitacion').toBe(201);
    writeState({ inviteConsumed: true, inviteAcceptedHere: true });
    await expect(page.getByRole('status').filter({ hasText: 'Cuenta creada' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir a ingresar' })).toBeVisible();

    // AUTH-12: el mismo enlace, ya usado -> estado honesto y sin formulario.
    await page.goto(`/invite/${token}`);
    await expect(page.getByRole('alert').filter({ hasText: /ya fue usada|expir|no es válida/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear mi cuenta' })).toHaveCount(0);
  });

  test('AUTH-11b la cuenta invitada existe: login real con rol operator', { tag: '@write' }, async ({ browser, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'login real: un solo viewport');
    const password = env('E2E_INVITE_PASSWORD');
    test.skip(!password, 'sin E2E_INVITE_PASSWORD');
    // Solo si ESTE arnes creo la cuenta: un login contra una cuenta de existencia desconocida gastaria un intento
    // del rate limit (observado: con el token ya consumido antes, el login con E2E_INVITE_PASSWORD dio 401).
    test.skip(!readState().inviteAcceptedHere, 'AUTH-11 no creo la cuenta en esta corrida (token consumido antes): sin evidencia de que exista');
    const { context, page } = await loginInNewContext(
      browser,
      baseURL!,
      inviteEmail(),
      password,
      path.join(Q1_DIR, 'invitado-session.json'),
      'AUTH-11b login e2e-invitado',
    );
    try {
      await expect(page).toHaveURL(/\/app/);
      // El rol real viene de la API de sesion; el menu de usuario lo muestra como "Operación" (TopbarUserMenu ROLE_LABEL),
      // no como "Operador" (ese es el nombre del rol en Equipo/invitaciones).
      const me = await context.request.get('/app/cuenta/api/me');
      expect(me.status(), 'GET /app/cuenta/api/me').toBe(200);
      expect(((await me.json()) as { staff?: { role?: string } }).staff?.role, 'rol de la cuenta invitada').toBe('operator');
      await page.getByRole('button', { name: 'Menú de usuario' }).click();
      await expect(page.getByText('Operación', { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
