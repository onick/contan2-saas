// q0-scaffold.spec.ts · humo del andamiaje: sesion de owner, /app sin overflow en 3 viewports,
// y (prod-readonly) GET /login = 200 + guardia de solo-lectura.
import { expect, test } from '../fixtures/test';
import { expectNoHorizontalOverflow } from '../support/layout';

test.describe('q0 scaffold', () => {
  test('owner autenticado: /app renderiza sin overflow horizontal', { tag: '@smoke' }, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'prod-readonly', 'prod-readonly no hace login');
    test.skip(testInfo.project.name === 'webkit-tablet', 'cubierto por los 3 viewports de chromium');

    const res = await page.goto('/app');
    expect(res?.status(), 'GET /app').toBeLessThan(400);
    await expect(page, 'no debe redirigir a /login').not.toHaveURL(/\/login/);
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
    await expectNoHorizontalOverflow(page, '/app');
  });

  test('prod-readonly: GET /login responde 200', { tag: '@smoke' }, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'prod-readonly', 'solo aplica a produccion (solo lectura)');
    const res = await page.goto('/login');
    expect(res?.status()).toBe(200);
    await expectNoHorizontalOverflow(page, '/login');
  });

  test('prod-readonly: el interceptor aborta POST', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'prod-readonly', 'solo aplica a produccion (solo lectura)');
    await page.goto('/login');
    // El POST nunca sale del navegador: la ruta lo aborta (blockedbyclient).
    const outcome = await page.evaluate(async () => {
      try {
        await fetch('/api/auth/login', { method: 'POST', body: '{}' });
        return 'sent';
      } catch {
        return 'blocked';
      }
    });
    expect(outcome).toBe('blocked');
  });
});
