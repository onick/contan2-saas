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

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { getTestApp } from '../helpers/app.js';

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
  async function loadConfigWithEnv(envOverrides) {
    const prev = {};
    const keys = ['PLATFORM_PUBLIC_URL', 'PUBLIC_URL', 'ROOT_DOMAIN', 'PORT'];
    for (const k of keys) prev[k] = process.env[k];
    for (const k of keys) {
      if (envOverrides[k] === undefined) delete process.env[k];
      else process.env[k] = envOverrides[k];
    }
    vi.resetModules();
    try {
      const mod = await import('../../src/config.js');
      return { config: mod.config, restore: () => {
        for (const k of keys) {
          if (prev[k] === undefined) delete process.env[k];
          else process.env[k] = prev[k];
        }
      }};
    } catch (e) {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
      throw e;
    }
  }

  it('default en prod (ROOT_DOMAIN=contan2.com) → https://admin.contan2.com', async () => {
    const { config, restore } = await loadConfigWithEnv({
      ROOT_DOMAIN: 'contan2.com',
      PORT: '3000',
    });
    try {
      expect(config.PLATFORM_PUBLIC_URL).toBe('https://admin.contan2.com');
      expect(config.PUBLIC_URL).toBe('http://localhost:3000');
      expect(config.PLATFORM_PUBLIC_URL).not.toBe(config.PUBLIC_URL);
    } finally { restore(); }
  });

  it('ROOT_DOMAIN=localhost → http://localhost:PORT (no rompe dev)', async () => {
    const { config, restore } = await loadConfigWithEnv({
      ROOT_DOMAIN: 'localhost',
      PORT: '3457',
    });
    try {
      expect(config.PLATFORM_PUBLIC_URL).toBe('http://localhost:3457');
    } finally { restore(); }
  });

  it('env PLATFORM_PUBLIC_URL explícito → toma precedencia', async () => {
    const { config, restore } = await loadConfigWithEnv({
      PLATFORM_PUBLIC_URL: 'https://super.example.test',
      ROOT_DOMAIN: 'contan2.com',
    });
    try {
      expect(config.PLATFORM_PUBLIC_URL).toBe('https://super.example.test');
    } finally { restore(); }
  });
});

describe('fix · HSTS · Strict-Transport-Security header', () => {
  async function buildAppWithEnv(envOverrides) {
    const prev = {};
    for (const k of Object.keys(envOverrides)) prev[k] = process.env[k];
    for (const [k, v] of Object.entries(envOverrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.resetModules();
    const { initRepositories } = await import('../../src/db/repositories.js');
    await initRepositories();
    const { createApp } = await import('../../src/app.js');
    const app = await createApp({ quietLogs: true });
    return { app, restore: () => {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }};
  }

  it('ROOT_DOMAIN=contan2.com → /healthz emite Strict-Transport-Security', async () => {
    const { app, restore } = await buildAppWithEnv({
      ROOT_DOMAIN: 'contan2.com',
      DB_DRIVER: 'memory',
      PUBLIC_URL: 'https://ccb.contan2.com',
    });
    try {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      const hsts = res.headers['strict-transport-security'];
      expect(hsts).toBeDefined();
      expect(hsts).toMatch(/max-age=31536000/);
      expect(hsts).toMatch(/includeSubDomains/);
      expect(hsts).toMatch(/preload/);
    } finally { restore(); }
  });

  it('ROOT_DOMAIN=localhost → /healthz NO emite Strict-Transport-Security', async () => {
    // No usamos getTestApp() porque el promise puede estar cacheado de
    // otro test que setteó ROOT_DOMAIN diferente. Construimos fresh con
    // env localhost explícito.
    const { app, restore } = await buildAppWithEnv({
      ROOT_DOMAIN: 'localhost',
      DB_DRIVER: 'memory',
      PUBLIC_URL: 'http://localhost:3457',
    });
    try {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.headers['strict-transport-security']).toBeUndefined();
    } finally { restore(); }
  });
});
