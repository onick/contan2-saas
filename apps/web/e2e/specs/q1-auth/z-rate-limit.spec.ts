// z-rate-limit.spec.ts · Q1 · AUTH-14: rate limit del login (10 intentos / 15 min por IP; los fallidos cuentan).
// CORRE EL ULTIMO y solo: bloquea el login de esta IP durante 15 min (afecta a cualquier otra corrida e2e
// desde la misma IP). Usa un correo INEXISTENTE para no sumar fallos a ninguna cuenta real (no hay lockout
// por cuenta si el staff no existe). Se detiene en el primer 429.
//   pnpm e2e --project=desktop-1440 specs/q1-auth/z-rate-limit.spec.ts
import { expect, test } from '../../fixtures/test';
import { fillLogin, loginsInWindow, note } from '../../support/q1-common';

test.use({ storageState: { cookies: [], origins: [] } });

test('AUTH-14 login: tras 10 intentos fallidos la API responde 429 y la UI avisa', { tag: '@write' }, async ({ request, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'un solo viewport: bloquea la IP 15 min');
  const email = `e2e-ratelimit-${Date.now().toString(36)}@test.local`;
  const priorInWindow = loginsInWindow(); // intentos de esta suite aun dentro de los 15 min (cuentan en el mismo contador)
  const statuses: number[] = [];
  let retryAfter: string | undefined;

  for (let i = 1; i <= 12; i++) {
    const r = await request.post('/api/auth/login', { data: { email, password: 'clave-incorrecta-123', rememberMe: false } });
    statuses.push(r.status());
    if (r.status() === 429) {
      retryAfter = r.headers()['retry-after'];
      const body = (await r.json()) as { error?: string };
      expect(body.error, 'mensaje de 429').toMatch(/Demasiados intentos/);
      break;
    }
    expect(r.status(), `intento ${i} previo al limite`).toBe(401);
  }

  const first429 = statuses.indexOf(429) + 1;
  expect(first429, `debe aparecer un 429 dentro de los primeros 11 intentos (estados: ${statuses.join(',')})`).toBeGreaterThan(0);
  expect(first429).toBeLessThanOrEqual(11);
  // 429 como mucho en el intento 11 si el contador estaba en cero; antes si habia logins previos en la ventana.
  note(testInfo, 'dato', `primer 429 en el intento ${first429}; logins previos de la suite en la ventana: ${priorInWindow}; retry-after: ${retryAfter ?? 'ausente'}`);
  if (!retryAfter) note(testInfo, 'hallazgo-S3', 'el 429 de login no envia Retry-After');

  // UI: con la IP ya limitada, el formulario muestra el mensaje de demasiados intentos (y no el generico).
  await page.goto('/login');
  await fillLogin(page, email, 'clave-incorrecta-123');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  const alert = page.getByRole('alert').filter({ hasText: /Demasiados intentos/ });
  await expect(alert).toBeVisible();
  await expect(alert).not.toContainText(/Credenciales/);
  // Incluso con una cuenta cualquiera la puerta sigue cerrada hasta que pase la ventana.
  await expect(page).toHaveURL(/\/login/);
});
