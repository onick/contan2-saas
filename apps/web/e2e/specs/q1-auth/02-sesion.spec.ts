// 02-sesion.spec.ts · Q1 · AUTH-01..AUTH-07 y AUTH-15 (login, `next`, sesion vencida, logout).
// Logins reales de este archivo: AUTH-02 (1 fallido, con el owner; el exito de AUTH-01 resetea el
// contador de bloqueo por cuenta) + AUTH-01/03 (1 exitoso). Todo lo demas se hace sin login:
// AUTH-04 intercepta el POST de login (fulfill 200) para observar solo la redireccion del cliente.
// Solo usa la sesion que abre este archivo (AUTH-07, el logout, esta en 05-cuenta.spec.ts).
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '../../fixtures/test';
import { statePath } from '../../fixtures/roles';
import { fillLogin, note, ownerSessionFile, spendLogin, writeState } from '../../support/q1-common';
import { env } from '../../env';

const EMPTY = { cookies: [], origins: [] };
test.use({ storageState: EMPTY });
test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'logins reales: solo desktop-1440 (rate limit por IP)');
});

const SESSION_COOKIE = 'contan2_session';
const OWNER_EMAIL = (): string => env('E2E_OWNER_EMAIL');
const OWNER_PASSWORD = (): string => env('E2E_OWNER_PASSWORD');

test.describe('Q1 sesion', () => {
  test('AUTH-02 password mala: mensaje generico en role=alert, sin enumerar', { tag: '@write' }, async ({ page }) => {
    spendLogin('AUTH-02 password mala (owner)');
    await page.goto('/login');
    await fillLogin(page, OWNER_EMAIL(), `${OWNER_PASSWORD()}-mala`);
    const resp = page.waitForResponse((r) => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    const r = await resp;
    expect(r.status(), 'password incorrecta').toBe(401);
    const body = (await r.json()) as { error?: string };
    expect(body.error, 'mensaje de la API generico').toMatch(/Credenciales inv/);

    // Mensaje visible y anunciado (role=alert = aria-live assertive).
    const alert = page.getByRole('alert').filter({ hasText: /Credenciales inv/ });
    await expect(alert).toBeVisible();
    // No distingue correo inexistente de password incorrecta.
    await expect(alert).not.toContainText(/no existe|no registrado|correo incorrecto|contraseña incorrecta/i);
    await expect(page).toHaveURL(/\/login/);
    // El correo se conserva y el boton vuelve a estar disponible.
    await expect(page.getByLabel('Correo')).toHaveValue(OWNER_EMAIL());
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeEnabled();
    // Sin cookie de sesion tras un fallo.
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === SESSION_COOKIE), 'no debe crearse sesion').toBeUndefined();
  });

  test('AUTH-01/03 login del owner con `next` profundo -> /app/cuenta con branding', { tag: ['@smoke', '@write'] }, async ({ page, context }) => {
    spendLogin('AUTH-01/03 login owner (next profundo)');
    // Sin sesion, una ruta profunda de /app lleva a /login con el `next` conservado.
    await page.goto('/app/cuenta');
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fcuenta/);

    // Branding del tenant en el login: nombre y logo reales (no "Contan2" generico).
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    const brandName = (await h1.innerText()).replace(/\s+/g, ' ').trim();
    expect(brandName.length, 'h1 con el nombre del centro').toBeGreaterThan(3);

    await fillLogin(page, OWNER_EMAIL(), OWNER_PASSWORD());
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/app\/cuenta$/, { timeout: 30_000 }); // AUTH-03: respeta el next
    await expect(page.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeVisible();

    // Cookie de sesion: HttpOnly + Secure + SameSite=Lax (sin valor en el reporte).
    const cookies = await context.cookies();
    const c = cookies.find((x) => x.name === SESSION_COOKIE);
    expect(c, 'cookie contan2_session').toBeDefined();
    expect(c!.httpOnly, 'HttpOnly').toBe(true);
    expect(c!.secure, 'Secure').toBe(true);
    expect(c!.sameSite, 'SameSite').toBe('Lax');

    // AUTH-01: /app carga con el shell y el branding del tenant.
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menú de usuario' })).toBeVisible();
    const first = brandName.split(' ')[0]!;
    expect(await page.title(), 'titulo con marca/producto').toMatch(/\S/);
    await expect(page.locator('body')).toContainText(new RegExp(first, 'i'));

    // Guardamos SOLO esta sesion para AUTH-04 y AUTH-07 (archivo gitignored).
    const file = ownerSessionFile();
    await context.storageState({ path: file });
    writeState({ ownerSession: file });

    // Sanity: el api vuelve 200 con esa sesion.
    const me = await context.request.get('/app/cuenta/api/me');
    expect(me.status()).toBe(200);
  });

  test('AUTH-04 open redirect: `next` hostil siempre termina en /app (sin logins)', async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    const file = ownerSessionFile();
    test.skip(!existsSync(file), 'AUTH-01 no dejo sesion propia');
    const host = new URL(baseURL!).host;
    const hostile: Array<[string, string]> = [
      ['//evil.example', '/app'],
      ['/\\evil.example', '/app'],
      ['/app/../x', '/app'],
      ['https://evil.example', '/app'],
      ['http://evil.example/app', '/app'],
      ['javascript:alert(1)', '/app'],
      ['%2F%2Fevil.example', '/app'], // doble codificado
      ['app/cuenta', '/app'], // relativa sin barra
      ['/login', '/app'], // fuera de /app
    ];
    const ok: Array<[string, string]> = [
      ['/app/cuenta', '/app/cuenta'],
      ['/app/cuenta?x=1&y=dos', '/app/cuenta?x=1&y=dos'],
    ];
    const context = await browser.newContext({ baseURL, storageState: file });
    try {
      for (const [next, expected] of [...hostile, ...ok]) {
        const page = await context.newPage();
        // El POST de login se simula (200): se observa solo la navegacion del cliente.
        await page.route('**/api/auth/login', (route) =>
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
        );
        await page.goto(`/login?next=${encodeURIComponent(next)}`);
        await fillLogin(page, 'qa-sin-envio@test.local', 'no-se-envia-al-servidor');
        await page.getByRole('button', { name: 'Ingresar' }).click();
        await page.waitForURL((u) => u.pathname.startsWith('/app'), { timeout: 20_000 });
        const u = new URL(page.url());
        expect(u.host, `next=${next}: no debe salir del host`).toBe(host);
        expect(u.pathname + u.search, `next=${next}`).toBe(expected);
        await page.close();
      }
      note(testInfo, 'cobertura', `${hostile.length} variantes hostiles + ${ok.length} legitimas, sin logins reales`);
    } finally {
      await context.close();
    }
  });

  test('AUTH-05 sesion vencida (cookie inventada) en SSR -> /login con next, sin datos', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, storageState: EMPTY });
    try {
      await context.addCookies([
        { name: SESSION_COOKIE, value: 'inventada-'.repeat(6), url: baseURL!, httpOnly: true, secure: true, sameSite: 'Lax' },
      ]);
      const page = await context.newPage();
      const res = await page.goto('/app/actividades');
      expect(res?.status(), 'la pagina final es /login').toBe(200);
      await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Factividades/);
      await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
      // Nada del admin se filtro en el HTML de la pagina de login.
      await expect(page.getByRole('navigation', { name: /principal|lateral/i })).toHaveCount(0);

      // Cookie de plataforma inventada en un tenant: tampoco entra (cookies separadas).
      await context.clearCookies();
      await context.addCookies([
        { name: 'contan2_admin_session', value: 'inventada-'.repeat(6), url: baseURL!, httpOnly: true, secure: true, sameSite: 'Lax' },
      ]);
      const p2 = await context.newPage();
      await p2.goto('/app');
      await expect(p2).toHaveURL(/\/login\?next=%2Fapp/);
    } finally {
      await context.close();
    }
  });

  test('AUTH-06 sesion vencida mientras se navega en el cliente -> /login, sin pantalla rota', async ({ browser, baseURL }) => {
    const owner = statePath('owner');
    test.skip(!existsSync(owner), 'sin .auth/owner.json');
    const context = await browser.newContext({ baseURL, storageState: owner });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/app/cuenta');
      await expect(page.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeVisible();
      await expect(page.getByText('Esta sesión')).toBeVisible({ timeout: 15_000 });

      // La sesion "vence" a mitad de la navegacion: se invalida la cookie SOLO en este contexto.
      await context.clearCookies();
      await context.addCookies([
        { name: SESSION_COOKIE, value: 'vencida-'.repeat(8), url: baseURL!, httpOnly: true, secure: true, sameSite: 'Lax' },
      ]);

      // BFF con cookie vencida: 401 limpio (no 500, sin datos).
      const status = await page.evaluate(async () => (await fetch('/app/cuenta/api/sessions', { cache: 'no-store' })).status);
      expect(status, 'BFF con cookie vencida').toBe(401);

      // Navegacion de cliente (sidebar/RSC): debe terminar en /login.
      const nav = page.getByRole('navigation').getByRole('link', { name: /Actividades/ }).first();
      await nav.click();
      await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 20_000 });
      await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
      expect(errors, 'sin excepciones no controladas').toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('AUTH-15 sesion de un tenant en OTRO host no entra (cross-tenant), sin filtrar', async ({ browser, baseURL }, testInfo) => {
    // No hay credenciales de test-tenant: se prueba la direccion inversa con la misma logica de servidor
    // (sesion de ccb presentada en test-tenant.stg). La direccion pedida (test-tenant -> ccb) comparte el check
    // `organization_id` de getAdminGate / requireTenantStaff.
    const owner = statePath('owner');
    test.skip(!existsSync(owner), 'sin .auth/owner.json');
    const token = (JSON.parse(readFileSync(owner, 'utf8')) as { cookies: Array<{ name: string; value: string }> }).cookies.find(
      (c) => c.name === SESSION_COOKIE,
    )?.value;
    test.skip(!token, 'owner.json sin cookie de sesion');
    const other = baseURL!.replace('//ccb.', '//test-tenant.');
    test.skip(other === baseURL, 'baseURL no es ccb.*');
    const context = await browser.newContext({ baseURL: other, storageState: EMPTY });
    try {
      await context.addCookies([{ name: SESSION_COOKIE, value: token!, url: other, httpOnly: true, secure: true, sameSite: 'Lax' }]);
      const page = await context.newPage();
      const res = await page.goto('/app');
      expect(res?.status()).toBe(200);
      await expect(page).toHaveURL(/\/login(\?|$)/);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText, 'no filtra datos de la sesion').not.toContain(env('E2E_OWNER_EMAIL'));
      await expect(page.getByRole('button', { name: 'Menú de usuario' })).toHaveCount(0);
      // Hallazgo S2 (marca): el login de un host de tenant sin branding publico cae al branding LOCAL por defecto
      // (CCB) en vez de un login neutro. Aqui se detecta, no se exige.
      if (/Banreservas/i.test(bodyText)) {
        note(testInfo, 'hallazgo-S2', 'login de test-tenant (y de un host inexistente) muestra "Centro Cultural Banreservas": fallback a DEFAULT_BRANDING en app/login/page.tsx');
      }
      note(testInfo, 'cobertura', 'direccion inversa (ccb->test-tenant); sin credenciales para loguear en test-tenant');
    } finally {
      await context.close();
    }
  });

  test('AUTH-15b: GET /auth/me rechaza (401) la sesion de otro tenant (Q8-64 corregido)', async ({ browser, baseURL }) => {
    // Q8-64: auth-me compara organizationId de la sesion con el tenant del host.
    const owner = statePath('owner');
    const token = (JSON.parse(readFileSync(owner, 'utf8')) as { cookies: Array<{ name: string; value: string }> }).cookies.find(
      (c) => c.name === SESSION_COOKIE,
    )?.value;
    test.skip(!token, 'owner.json sin cookie de sesion');
    const other = baseURL!.replace('//ccb.', '//test-tenant.');
    const context = await browser.newContext({ baseURL: other, storageState: EMPTY });
    try {
      await context.addCookies([{ name: SESSION_COOKIE, value: token!, url: other, httpOnly: true, secure: true, sameSite: 'Lax' }]);
      const api = await context.request.get(`${other}/app/cuenta/api/me`);
      expect(api.status(), 'BFF /me con sesion de otro tenant').toBe(401);
    } finally {
      await context.close();
    }
  });

  test('AUTH-15c: la sesion de test-tenant (direccion pedida) no entra a ccb; en su propio host si', { tag: '@write' }, async ({ browser, baseURL }) => {
    // Requiere el tenant semilla (provision/seed-staging.sql, seccion 6) y E2E_TEST_TENANT_OWNER_PASSWORD.
    const pw = env('E2E_TEST_TENANT_OWNER_PASSWORD');
    test.skip(!pw, 'sin E2E_TEST_TENANT_OWNER_PASSWORD (tenant semilla test-tenant no sembrado)');
    const other = baseURL!.replace('//ccb.', '//test-tenant.');
    test.skip(other === baseURL, 'baseURL no es ccb.*');
    spendLogin('AUTH-15c login owner test-tenant');
    const own = await browser.newContext({ baseURL: other, storageState: EMPTY });
    try {
      const login = await own.request.post(`${other}/api/auth/login`, {
        data: { email: 'e2e-owner@test-tenant.local', password: pw, rememberMe: false },
      });
      test.skip(login.status() === 404 || login.status() === 503, `test-tenant no existe/disponible (${login.status()}): aplicar el seed`);
      expect(login.status(), 'login del owner de test-tenant').toBe(200);
      const token = (await own.cookies(other)).find((c) => c.name === SESSION_COOKIE)?.value;
      expect(token, 'cookie de sesion en test-tenant').toBeTruthy();
      expect((await own.request.get(`${other}/app/cuenta/api/me`)).status(), '/me en su propio host').toBe(200);

      // La misma cookie presentada en ccb: rechazada (cross-tenant), sin filtrar datos.
      const ccb = await browser.newContext({ baseURL: baseURL!, storageState: EMPTY });
      try {
        await ccb.addCookies([{ name: SESSION_COOKIE, value: token!, url: baseURL!, httpOnly: true, secure: true, sameSite: 'Lax' }]);
        expect((await ccb.request.get(`${baseURL}/app/cuenta/api/me`)).status(), '/me en ccb con sesion de test-tenant').toBe(401);
        const page = await ccb.newPage();
        await page.goto('/app');
        await expect(page).toHaveURL(/\/login(\?|$)/);
      } finally {
        await ccb.close();
      }
    } finally {
      await own.close();
    }
  });

  // AUTH-07 (logout + back) vive en 05-cuenta.spec.ts: usa una sesion de e2e-reset abierta para ese fin.
});
