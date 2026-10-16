// fixtures/test.ts · `test` extendido. Todos los specs importan de aqui, no de @playwright/test.
import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { assertStaging, BASE_URL, PLATFORM_URL } from '../env';
import { statePath, type Role } from './roles';

export { expect };

/** Rutas bloqueadas en prod-readonly aunque sean GET (login, PIN, typeahead, RSVP, recuperar). */
const PROD_RO_BLOCKED_GET = [
  /\/api\/auth\//,
  /\/scanner\/api\//,
  /\/api\/(v2\/)?public\/.*(suggest|checkin)/,
  /\/rsvp\//,
  /\/recuperar/,
];

export async function applyProdReadonlyGuard(context: BrowserContext): Promise<void> {
  await context.route('**/*', (route) => {
    const req = route.request();
    const m = req.method();
    if (m !== 'GET' && m !== 'HEAD') return route.abort('blockedbyclient');
    const url = req.url();
    if (PROD_RO_BLOCKED_GET.some((re) => re.test(url))) return route.abort('blockedbyclient');
    return route.continue();
  });
}

export interface E2EFixtures {
  /** Guarda automatica: prod-readonly aborta no-GET/HEAD; el resto exige staging. */
  _guard: void;
  /** Abre un contexto nuevo con la sesion de un rol (cookie de global-setup). */
  asRole: (role: Role | 'scanner' | 'platform') => Promise<{ context: BrowserContext; page: Page }>;
  /** Errores de consola/pageerror de la app durante el test. */
  consoleErrors: string[];
}

async function contextFor(browser: Browser, baseURL: string, state: string, opts: Record<string, unknown>) {
  if (!existsSync(state)) {
    throw new Error(`Falta ${state}: corre el proyecto setup (credenciales del rol en .env.e2e).`);
  }
  return browser.newContext({ ...opts, baseURL, storageState: state });
}

export const test = base.extend<E2EFixtures>({
  _guard: [
    async ({ context }, use, testInfo) => {
      if (testInfo.project.name === 'prod-readonly') {
        await applyProdReadonlyGuard(context);
      } else {
        assertStaging(String(testInfo.project.use.baseURL ?? BASE_URL));
      }
      await use();
    },
    { auto: true },
  ],

  asRole: async ({ browser }, use, testInfo) => {
    if (testInfo.project.name === 'prod-readonly') {
      throw new Error('asRole no esta permitido en prod-readonly (sin login).');
    }
    const opened: BrowserContext[] = [];
    await use(async (role) => {
      const baseURL = role === 'platform' ? PLATFORM_URL : String(testInfo.project.use.baseURL ?? BASE_URL);
      assertStaging(baseURL);
      const { use: projectUse } = testInfo.project;
      const ctxOpts: Record<string, unknown> = {
        viewport: projectUse.viewport ?? undefined,
        deviceScaleFactor: projectUse.deviceScaleFactor,
        isMobile: projectUse.isMobile,
        hasTouch: projectUse.hasTouch,
        userAgent: projectUse.userAgent,
        locale: projectUse.locale,
        timezoneId: projectUse.timezoneId,
      };
      const context = await contextFor(browser, baseURL, statePath(role), ctxOpts);
      opened.push(context);
      const page = await context.newPage();
      return { context, page };
    });
    for (const c of opened) await c.close();
  },

  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
    });
    await use(errors);
  },
});
