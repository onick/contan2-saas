// 01-publico.spec.ts · Q1 · PUB-01..PUB-04 (superficies publicas sin login).
// Cero logins. El formulario de contacto de la landing NO se envia; el signup solo se valida
// (payloads invalidos -> 400, nunca se crea tenant ni se manda codigo).
import { expect, test } from '../../fixtures/test';
import { expectNoHorizontalOverflow } from '../../support/layout';
import { marketingBase, note } from '../../support/q1-common';

// Estas pruebas no usan la sesion del owner.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Q1 publico', () => {
  test('PUB-01 la raiz del tenant redirige 307 a /login', { tag: '@smoke' }, async ({ request }) => {
    const res = await request.get('/', { maxRedirects: 0 });
    expect(res.status(), 'GET / en un tenant').toBe(307);
    expect(res.headers()['location']).toMatch(/\/login$/);
    // Staging: nunca indexable.
    expect(res.headers()['x-robots-tag'] ?? '').toContain('noindex');

    // /landing directo en un tenant tambien lleva a /login.
    const landing = await request.get('/landing', { maxRedirects: 0 });
    expect(landing.status(), 'GET /landing en un tenant').toBe(307);
    expect(landing.headers()['location']).toMatch(/\/login$/);
  });

  test('PUB-01b el navegador termina en /login con el formulario', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Olvidaste tu contraseña/ })).toBeVisible();
    await expectNoHorizontalOverflow(page, `/login ${testInfo.project.name}`);
  });

  test('PUB-02 landing de marketing: 200, un h1, sin JS de Next, noindex', { tag: '@smoke' }, async ({ request, baseURL }) => {
    const mk = marketingBase(baseURL!);
    const res = await request.get(`${mk}/`, { maxRedirects: 0 });
    expect(res.status(), `GET ${mk}/`).toBe(200);
    expect(res.headers()['x-robots-tag'] ?? '', 'staging debe ser noindex').toContain('noindex');
    const html = await res.text();
    expect((html.match(/<h1[\s>]/g) ?? []).length, 'un solo h1').toBe(1);
    expect(html, 'landing estatica: sin <script src=/_next').not.toMatch(/<script[^>]+src=["']\/_next/);
    expect(html).toMatch(/<html[^>]+lang="es/);
  });

  test('PUB-02b landing en el navegador: h1, CTA y formulario de contacto presentes (sin enviar)', async ({ page, baseURL }, testInfo) => {
    const mk = marketingBase(baseURL!);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${mk}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('link', { name: /contan2, inicio/ }).first()).toBeVisible();
    await expect(page.locator('form#contacto-form')).toHaveCount(1);
    // El formulario existe pero NO se envia (ningun POST a /api/contact en esta prueba).
    await expectNoHorizontalOverflow(page, `landing ${testInfo.project.name}`);
    expect(errors, 'sin errores JS en la landing').toEqual([]);
  });

  test('PUB-03 TenantFinder: correo desconocido -> mensaje neutro, sin PII', async ({ page, baseURL }) => {
    const mk = marketingBase(baseURL!);
    await page.goto(`${mk}/login`);
    // En el host de marketing /login es el buscador email-first.
    await expect(page.getByRole('heading', { level: 1, name: /Entra a tu centro/ })).toBeVisible();
    const input = page.getByLabel('Correo de tu cuenta');
    await expect(input).toBeVisible();
    const unknown = `e2e-nadie-${Date.now().toString(36)}@test.local`;
    await input.fill(unknown);
    const lookup = page.waitForResponse((r) => r.url().endsWith('/login/api/find'));
    await input.press('Enter'); // teclado: Enter envia
    const res = await lookup;
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { tenants?: unknown[] };
    expect(body.tenants, 'sin coincidencias -> lista vacia').toEqual([]);
    expect(Object.keys(body), 'solo la lista de tenants').toEqual(['tenants']);
    await expect(page.getByText(/No encontramos una cuenta de equipo con ese correo/)).toBeVisible();
    // El mensaje neutro no repite el correo escrito.
    await expect(page.getByText(unknown)).toHaveCount(0);
  });

  test('PUB-03b TenantFinder: la respuesta de un correo real solo expone slug y nombre', async ({ request, baseURL }) => {
    const mk = marketingBase(baseURL!);
    const ownerEmail = process.env.E2E_OWNER_EMAIL ?? '';
    test.skip(!ownerEmail, 'sin E2E_OWNER_EMAIL');
    const res = await request.post(`${mk}/login/api/find`, { data: { email: ownerEmail } });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { tenants: Array<Record<string, unknown>> };
    expect(body.tenants.length).toBeGreaterThanOrEqual(1);
    for (const t of body.tenants) {
      expect(Object.keys(t).sort(), 'solo slug y name (sin ids, emails ni roles)').toEqual(['name', 'slug']);
    }
    // Hallazgo de diseno (S2): el buscador confirma que un correo existe como staff (oraculo de enumeracion).
    note(test.info(), 'hallazgo-S2', 'tenant-lookup confirma existencia de un correo de staff y el nombre del centro (por diseno email-first; solo limita 5/min por IP)');
  });

  test('PUB-04 signup: la API solo valida (payloads invalidos -> 400, nada se crea)', { tag: '@write' }, async ({ request, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'validacion de API: un solo viewport');
    const mk = marketingBase(baseURL!);
    const post = (data: Record<string, string>) => request.post(`${mk}/api/auth/signup`, { data });

    const vacio = await post({ organizationName: '', fullName: '', email: '', password: '', confirmPassword: '' });
    expect(vacio.status(), 'campos vacios').toBe(400);

    const noCoincide = await post({
      organizationName: 'QA Sin Crear', fullName: 'QA', email: 'e2e-no-crear@test.local',
      password: 'Distinta-1234-aA', confirmPassword: 'Otra-1234-aA',
    });
    expect(noCoincide.status(), 'contrasenas distintas').toBe(400);

    // OJO (hallazgo S2, observado una vez a mano): una contrasena de 8 digitos con el resto valido NO se
    // rechaza -> el servidor inserta signup_verifications y falla con 500 al enviar el correo. Por eso la
    // prueba automatica NO reintenta ese caso (dejaria filas pendientes).
  });

  test('PUB-04b el modal de registro no tiene punto de entrada en la landing', async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'inspeccion de landing: un solo viewport');
    const mk = marketingBase(baseURL!);
    await page.goto(`${mk}/`);
    // SignupModal/SignupTrigger existen en el codigo, pero la landing solo ofrece demo (#contacto) y /login.
    const triggers = page.getByRole('button', { name: /registr|crear cuenta|empezar gratis|prueba gratis/i });
    const n = await triggers.count();
    note(testInfo, 'hallazgo-S3', `SignupTrigger/SignupModal sin punto de entrada en la landing (botones de registro: ${n}); codigo muerto o flujo oculto`);
    expect(n).toBe(0);
  });
});
