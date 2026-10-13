/**
 * smoke-app.mjs — Post-deploy health check for the deployed Next.js app.
 *
 * Usage:
 *   BASE_URL=https://ccb.contan2.com \
 *   SMOKE_EMAIL=smoke@example.com \
 *   SMOKE_PASSWORD=secret \
 *   node scripts/release/smoke-app.mjs
 *
 * Exit codes:
 *   0 — all routes OK
 *   1 — one or more routes failed (>= 500 or error HTML)
 *   2 — missing required env vars
 */

import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

// ---------------------------------------------------------------------------
// Evaluation logic — exported for unit tests
// ---------------------------------------------------------------------------

const ERROR_STRINGS = [
  "This page couldn't load",
  'Application error',
  'Internal Server Error',
];

/**
 * Evaluate a single route response.
 * @param {number} status  HTTP status code
 * @param {string} body    Response body text
 * @returns {'OK'|'FAIL'}
 */
export function evaluateRoute(status, body) {
  if (status >= 500) return 'FAIL';
  if (ERROR_STRINGS.some((s) => body.includes(s))) return 'FAIL';
  return 'OK';
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function request(method, urlStr, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: {
        ...headers,
        ...(bodyStr
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyStr),
            }
          : {}),
      },
    };
    const req = mod.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      );
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const PUBLIC_ROUTES = ['/login', '/kiosko', '/scanner', '/api/version'];

const PROTECTED_ROUTES = [
  '/app',
  '/app/actividades',
  '/app/check-in',
  '/app/puerta',
  '/app/registros',
  '/app/usuarios',
  '/app/segmentos',
  '/app/protocolo',
  '/app/reportes',
  '/app/biblioteca',
  '/app/identidad',
  '/app/modo-publico',
  '/app/equipo',
  '/app/historial',
  '/app/cuenta',
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const BASE_URL = process.env.BASE_URL;
  const SMOKE_EMAIL = process.env.SMOKE_EMAIL;
  const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD;

  if (!BASE_URL || !SMOKE_EMAIL || !SMOKE_PASSWORD) {
    console.error(
      'Error: missing required env vars. Set BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD.'
    );
    process.exit(2);
  }

  // -- Login ----------------------------------------------------------------
  let sessionCookie = null;
  try {
    const loginRes = await request('POST', `${BASE_URL}/api/auth/login`, {
      body: { email: SMOKE_EMAIL, password: SMOKE_PASSWORD },
    });
    if (loginRes.status !== 200) {
      console.error(
        `Login failed: HTTP ${loginRes.status}. Check SMOKE_EMAIL / SMOKE_PASSWORD.`
      );
      process.exit(1);
    }
    const setCookie = loginRes.headers['set-cookie'];
    sessionCookie =
      (Array.isArray(setCookie) ? setCookie : [setCookie ?? '']).find((c) =>
        c.includes('contan2_session')
      ) ?? null;
    if (!sessionCookie) {
      console.error(
        'Login succeeded (200) but no contan2_session cookie found in response.'
      );
      process.exit(1);
    }
    // Keep only the cookie name=value part (strip attributes)
    sessionCookie = sessionCookie.split(';')[0];
  } catch (err) {
    console.error(`Login request error: ${err.message}`);
    process.exit(1);
  }

  // -- Route probing --------------------------------------------------------
  const results = [];

  const probe = async (route, needsSession) => {
    const headers = needsSession ? { Cookie: sessionCookie } : {};
    try {
      const res = await request('GET', `${BASE_URL}${route}`, { headers });
      const result = evaluateRoute(res.status, res.body);
      results.push({ route, status: res.status, result });
    } catch (err) {
      results.push({ route, status: 'ERR', result: 'FAIL', error: err.message });
    }
  };

  for (const route of PUBLIC_ROUTES) {
    await probe(route, false);
  }
  for (const route of PROTECTED_ROUTES) {
    await probe(route, true);
  }

  // -- Output table ---------------------------------------------------------
  const COL_ROUTE = 28;
  const COL_STATUS = 8;

  console.log(
    `${'Route'.padEnd(COL_ROUTE)}${'Status'.padEnd(COL_STATUS)}Result`
  );
  console.log('-'.repeat(COL_ROUTE + COL_STATUS + 6));

  let failures = 0;
  for (const { route, status, result, error } of results) {
    const statusStr = String(status).padEnd(COL_STATUS);
    const suffix = error ? ` (${error})` : result === 'FAIL' ? ' (fail)' : '';
    console.log(`${route.padEnd(COL_ROUTE)}${statusStr}${result}${suffix}`);
    if (result === 'FAIL') failures++;
  }

  console.log('');
  if (failures === 0) {
    console.log(`PASS — all ${results.length} routes OK`);
    process.exit(0);
  } else {
    console.log(
      `FAIL — ${failures} of ${results.length} routes failed`
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Guard: only run when executed directly (not when imported by tests)
// ---------------------------------------------------------------------------
const isMain =
  process.argv[1] &&
  new URL(process.argv[1], 'file://').pathname ===
    new URL(import.meta.url).pathname;

if (isMain) {
  await main();
}
