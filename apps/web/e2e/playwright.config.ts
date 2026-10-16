// playwright.config.ts · QA end-to-end de contan2 (staging). Ver docs/plans/2026-10-16-qa-user-flows-ui.md.
// Correr desde apps/web:  pnpm e2e --project=desktop-1440 --grep @smoke
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { assertStaging, BASE_URL, E2E_DIR, PROD_URL } from './env';
import { statePath } from './fixtures/roles';

// Los proyectos de escritura/lectura autenticada SOLO apuntan a staging (aborta si no).
assertStaging(BASE_URL);

const DR = { locale: 'es-DO', timezoneId: 'America/Santo_Domingo' } as const;
const ownerState = statePath('owner');

// Rate limits por IP: con escrituras un solo worker; si no, pocos workers.
// `--grep @smoke` TAMBIEN escribe (ADM-03/08a/12, KIO-02, SCN-07, AUTH-01 llevan @write ademas de @smoke),
// asi que cuenta como escritura. E2E_WORKERS manda siempre (CI lo fija en 1).
function isWriting(argv: string[] = process.argv): boolean {
  const grep = argv.filter((a, i) => a.startsWith('--grep') || argv[i - 1] === '--grep' || argv[i - 1] === '-g');
  return /@write|@smoke/.test(grep.join(' '));
}
const workers = Number(process.env.E2E_WORKERS) || (isWriting() ? 1 : 2);

export default defineConfig({
  testDir: path.join(E2E_DIR, 'specs'),
  outputDir: path.join(E2E_DIR, '..', 'test-results'),
  globalSetup: path.join(E2E_DIR, 'global-setup.ts'),
  globalTeardown: path.join(E2E_DIR, 'global-teardown.ts'),
  fullyParallel: false,
  workers,
  retries: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(E2E_DIR, '..', 'playwright-report'), open: 'never' }],
    ['json', { outputFile: path.join(E2E_DIR, '.artifacts', 'report.json') }],
  ],
  use: {
    baseURL: BASE_URL,
    ...DR,
    // E2E_NO_MEDIA=1 (CI): staging tiene datos reales copiados -> sin trazas, video ni screenshots.
    trace: process.env.E2E_NO_MEDIA ? 'off' : 'retain-on-failure',
    screenshot: process.env.E2E_NO_MEDIA ? 'off' : 'only-on-failure',
    video: process.env.E2E_NO_MEDIA ? 'off' : 'retain-on-failure',
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      // Verifica que global-setup dejo las sesiones; no hace logins propios.
      name: 'setup',
      testDir: path.join(E2E_DIR, 'setup'),
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'desktop-1440',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, ...DR, storageState: ownerState },
    },
    {
      name: 'tablet-820',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
        ...DR,
        storageState: ownerState,
      },
    },
    {
      name: 'mobile-390',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        ...DR,
        storageState: ownerState,
      },
    },
    {
      // iPad en WebKit: kiosko y escaner (Safari iPad es el dispositivo real de la puerta).
      name: 'webkit-tablet',
      dependencies: ['setup'],
      use: { ...devices['iPad (gen 7)'], ...DR, storageState: ownerState },
    },
    {
      // Produccion: SOLO GET/HEAD (fixtures/test.ts aborta lo demas), sin login, sin setup.
      name: 'prod-readonly',
      testMatch: /.*prod-ro.*\.spec\.ts|.*q0-scaffold\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, ...DR, baseURL: PROD_URL, storageState: undefined },
    },
  ],
});
