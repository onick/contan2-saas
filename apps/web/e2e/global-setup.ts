// global-setup.ts · corre UNA vez por ejecucion (antes de los proyectos).
//  1) assertStaging  2) genera runId  3) login por rol -> .auth/<rol>.json (reusa si sigue valido)
// Rate limit de login: 10 / 15 min por IP (los fallidos cuentan) -> UN POST por rol, nunca reintenta.
// Nunca imprime cookies, tokens ni passwords.
import { request, type APIRequestContext, type FullConfig } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR, assertStaging, AUTH_DIR, BASE_URL, env, onlyProdReadonly, PLATFORM_URL } from './env';
import { ledgerDir, newRunId } from './fixtures/data';
import { ROLES, roleEmail, rolePassword, statePath, type Role } from './fixtures/roles';

async function stateStillValid(file: string, baseURL: string, probe: string): Promise<boolean> {
  if (!existsSync(file)) return false;
  const ctx = await request.newContext({ baseURL, storageState: file });
  try {
    const res = await ctx.get(probe, { maxRedirects: 0, timeout: 20_000 });
    return res.status() === 200;
  } catch {
    return false;
  } finally {
    await ctx.dispose();
  }
}

async function loginRole(role: Role, baseURL: string): Promise<string> {
  const file = statePath(role);
  const email = roleEmail(role);
  const password = rolePassword(role);
  if (!email || !password) return `skip (sin credenciales en .env.e2e)`;
  if (await stateStillValid(file, baseURL, '/app')) return 'reutilizado';
  const ctx: APIRequestContext = await request.newContext({ baseURL });
  try {
    const res = await ctx.post('/api/auth/login', { data: { email, password, rememberMe: false }, timeout: 30_000 });
    if (!res.ok()) {
      // Sin cuerpo: puede contener el mensaje de lockout; solo el status.
      throw new Error(`login ${role} fallo: HTTP ${res.status()} (no se reintenta: cuenta contra el rate limit)`);
    }
    await ctx.storageState({ path: file });
    return 'login ok';
  } finally {
    await ctx.dispose();
  }
}

async function loginScanner(baseURL: string): Promise<string> {
  const pin = env('E2E_SCANNER_PIN');
  if (!pin) return 'skip (sin E2E_SCANNER_PIN)';
  const file = statePath('scanner');
  if (await stateStillValid(file, baseURL, '/scanner/api/me')) return 'reutilizado';
  const ctx = await request.newContext({ baseURL });
  try {
    const res = await ctx.post('/scanner/api/pin', { data: { pin }, timeout: 30_000 });
    if (!res.ok()) throw new Error(`PIN de escaner fallo: HTTP ${res.status()}`);
    await ctx.storageState({ path: file });
    return 'pin ok';
  } finally {
    await ctx.dispose();
  }
}

async function loginPlatform(): Promise<string> {
  const email = env('E2E_PLATFORM_EMAIL');
  const password = env('E2E_PLATFORM_PASSWORD');
  if (!email || !password) return 'skip (sin credenciales de plataforma)';
  assertStaging(PLATFORM_URL);
  const file = statePath('platform');
  const ctx = await request.newContext({ baseURL: PLATFORM_URL });
  try {
    const res = await ctx.post('/platform/api/login', { data: { email, password }, timeout: 30_000 });
    if (!res.ok()) throw new Error(`login plataforma fallo: HTTP ${res.status()}`);
    await ctx.storageState({ path: file });
    return 'login ok';
  } finally {
    await ctx.dispose();
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  if (onlyProdReadonly()) {
    console.log('[e2e] prod-readonly: sin setup, sin login.');
    return;
  }
  assertStaging(BASE_URL);

  const runId = process.env.E2E_RUN_ID || newRunId();
  process.env.E2E_RUN_ID = runId; // los workers lo heredan
  mkdirSync(AUTH_DIR, { recursive: true });
  mkdirSync(ledgerDir(), { recursive: true });
  writeFileSync(path.join(ARTIFACTS_DIR, 'current-run.json'), JSON.stringify({ runId, startedAt: new Date().toISOString() }));
  console.log(`[e2e] runId=${runId} baseURL=${BASE_URL}`);

  // E2E_ROLES=owner,admin limita los logins (cada intento cuenta contra el rate limit de 10/15min).
  const only = env('E2E_ROLES')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const wants = (name: string) => only.length === 0 || only.includes(name);
  for (const role of ROLES) {
    if (wants(role)) console.log(`[e2e] setup ${role}: ${await loginRole(role, BASE_URL)}`);
  }
  if (wants('scanner')) console.log(`[e2e] setup scanner: ${await loginScanner(BASE_URL)}`);
  if (wants('platform')) console.log(`[e2e] setup platform: ${await loginPlatform()}`);
}
