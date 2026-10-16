// setup/auth.setup.ts · el login real lo hace global-setup.ts (una vez por ejecucion).
// Este "proyecto" solo comprueba que el owner quedo autenticado, para fallar rapido y claro.
import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { statePath } from '../fixtures/roles';

test('sesion de owner disponible (global-setup)', () => {
  expect(
    existsSync(statePath('owner')),
    'Falta .auth/owner.json: completa E2E_OWNER_EMAIL/E2E_OWNER_PASSWORD en e2e/.env.e2e',
  ).toBe(true);
});
