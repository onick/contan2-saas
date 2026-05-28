// =============================================================================
// test/security/platform-admin-ux.test.js
// =============================================================================
// Cubre 3 fixes del flujo de super admin (rama fix/platform-admin-ux):
//
//   1. platform-login.html sirve sus assets con paths absolutos (CSS + JS).
//      Antes: href="login.css" → resuelto contra /login/reset/ → 404 → texto
//      HTML del SPA fallback con content-type text/html → browser refuse
//      → página sin estilo.
//      Ahora: href="/login.css" → 200 con content-type text/css.
//
//   2. config.PLATFORM_PUBLIC_URL existe y es el host del super admin
//      (default https://admin.${ROOT_DOMAIN} en prod, fallback localhost
//      en dev). Diferente de config.PUBLIC_URL que es del tenant.
//
//   3. Strict-Transport-Security header presente cuando ROOT_DOMAIN !=
//      'localhost' (simula prod), ausente cuando ROOT_DOMAIN === 'localhost'
//      (dev) para no romper localhost.
// =============================================================================

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { getTestApp } from '../helpers/app.js';

// Higiene global del archivo: este archivo es el único en /security que
// muta process.env (para probar branches del config y middleware HSTS
// dependientes de ROOT_DOMAIN). Sin esto, vitest deja:
//   1. process.env contaminado para los archivos siguientes (alfabético:
//      platform-router, public-stays-public, version-endpoint, …).
//   2. La cache de módulos con app.js/config.js/repositories.js
//      construidos con env mutada — si otro archivo lee de ahí
//      cualquier estado derivado (config.ROOT_DOMAIN, UPLOADS_DIR), ve
//      un valor stale.
// Fix:
//   - unstubEnvs:true en vitest.config.js auto-restaura vi.stubEnv tras
//     cada test.
//   - vi.resetModules() en afterEach garantiza que la próxima import
//     dinámica re-evalúe con el env ya restaurado.
afterEach(() => {
  vi.resetModules();
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

describe('fix · platform-login.html · assets absolutos', () => {
  const html = readFileSync(
    path.join(REPO_ROOT, 'frontend', 'platform-login.html'),
    'utf8',
  );

  it('CSS · usa /login.css (absoluto), no login.css (relativo)', () => {
    expect(html).toMatch(/<link\s[^>]*href="\/login\.css"/);
    // Negativo: no debe haber el path relativo que rompe en /login/reset
    expect(html).not.toMatch(/<link\s[^>]*href="login\.css"/);
  });

  it('JS · usa /platform-login.js (absoluto), no platform-login.js (relativo)', () => {
    expect(html).toMatch(/<script\s[^>]*src="\/platform-login\.js"/);
    expect(html).not.toMatch(/<script\s[^>]*src="platform-login\.js"/);
  });
});

describe('fix · config.PLATFORM_PUBLIC_URL · separado de PUBLIC_URL', () => {
  // vi.stubEnv permite cleanup automático vía unstubEnvs:true en
  // vitest.config.js. Las 4 keys que el config lee — si alguna no se
  // toca en un test, primero la "stubeamos" a undefined para evitar
  // que un valor heredado del shell (ej. PUBLIC_URL en .env) ensucie
  // el assert.
  const CONFIG_KEYS = ['PLATFORM_PUBLIC_URL', 'PUBLIC_URL', 'ROOT_DOMAIN', 'PORT'];

  async function loadConfigWithEnv(envOverrides) {
    for (const k of CONFIG_KEYS) {
      if (envOverrides[k] === undefined) vi.stubEnv(k, '');
      else vi.stubEnv(k, envOverrides[k]);
    }
    vi.resetModules();
    const mod = await import('../../src/config.js');
    return mod.config;
  }

  it('default en prod (ROOT_DOMAIN=contan2.com) → https://admin.contan2.com', async () => {
    const config = await loadConfigWithEnv({
      ROOT_DOMAIN: 'contan2.com',
      PORT: '3000',
    });
    expect(config.PLATFORM_PUBLIC_URL).toBe('https://admin.contan2.com');
    expect(config.PUBLIC_URL).toBe('http://localhost:3000');
    expect(config.PLATFORM_PUBLIC_URL).not.toBe(config.PUBLIC_URL);
  });

  it('ROOT_DOMAIN=localhost → http://localhost:PORT (no rompe dev)', async () => {
    const config = await loadConfigWithEnv({
      ROOT_DOMAIN: 'localhost',
      PORT: '3457',
    });
    expect(config.PLATFORM_PUBLIC_URL).toBe('http://localhost:3457');
  });

  it('env PLATFORM_PUBLIC_URL explícito → toma precedencia', async () => {
    const config = await loadConfigWithEnv({
      PLATFORM_PUBLIC_URL: 'https://super.example.test',
      ROOT_DOMAIN: 'contan2.com',
    });
    expect(config.PLATFORM_PUBLIC_URL).toBe('https://super.example.test');
  });
});

describe('fix · HSTS · Strict-Transport-Security header', () => {
  // Mismo patrón que el bloque anterior: vi.stubEnv + unstubEnvs:true en
  // config + vi.resetModules() en afterEach (global del archivo).
  async function buildAppWithEnv(envOverrides) {
    for (const [k, v] of Object.entries(envOverrides)) {
      vi.stubEnv(k, v ?? '');
    }
    vi.resetModules();
    const { initRepositories } = await import('../../src/db/repositories.js');
    await initRepositories();
    const { createApp } = await import('../../src/app.js');
    return await createApp({ quietLogs: true });
  }

  it('ROOT_DOMAIN=contan2.com → /healthz emite Strict-Transport-Security', async () => {
    const app = await buildAppWithEnv({
      ROOT_DOMAIN: 'contan2.com',
      DB_DRIVER: 'memory',
      PUBLIC_URL: 'https://ccb.contan2.com',
    });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    const hsts = res.headers['strict-transport-security'];
    expect(hsts).toBeDefined();
    expect(hsts).toMatch(/max-age=31536000/);
    expect(hsts).toMatch(/includeSubDomains/);
    expect(hsts).toMatch(/preload/);
  });

  it('ROOT_DOMAIN=localhost → /healthz NO emite Strict-Transport-Security', async () => {
    // NOTA histórica: este test antes evitaba getTestApp() por el riesgo de
    // promise cacheado con ROOT_DOMAIN distinto. Con unstubEnvs:true +
    // vi.resetModules() en afterEach + isolate:true entre archivos, ese
    // riesgo ya no existe — pero seguimos armando la app aquí porque el
    // test específicamente exercita ROOT_DOMAIN=localhost en una app fresh.
    const app = await buildAppWithEnv({
      ROOT_DOMAIN: 'localhost',
      DB_DRIVER: 'memory',
      PUBLIC_URL: 'http://localhost:3457',
    });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});
