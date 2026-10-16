// support/q1-common.ts · helpers de la ola Q1 (publico y autenticacion).
// - Contador de logins reales contra el rate limit por IP (10/15 min, los fallidos cuentan):
//   cada POST real a /api/auth/login se registra en .artifacts/q1-logins.ndjson y `spendLogin`
//   aborta si ya se gastaron 8 en la ventana de 15 min (el resto queda para el test de rate limit).
// - Estado entre specs/corridas (.artifacts/q1-state.json, gitignored): contrasena vigente de
//   e2e-reset y sesiones propias. Nunca se imprimen.
// - Hallazgos de test/producto como anotaciones del reporte.
// Solo staging.
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR, env } from '../env';

export const Q1_DIR = path.join(ARTIFACTS_DIR, 'q1');
const LOGIN_LOG = path.join(Q1_DIR, 'q1-logins.ndjson');
const STATE_FILE = path.join(Q1_DIR, 'q1-state.json');

export const RESET_EMAIL = 'e2e-reset@test.local';
export const INVITE_EMAIL_DEFAULT = 'e2e-invitado@test.local';
export const LOGIN_BUDGET = 8; // maximo de intentos de login (ok o fallidos) en 15 min antes del test de rate limit
const WINDOW_MS = 15 * 60 * 1000;

function ensureDir(): void {
  mkdirSync(Q1_DIR, { recursive: true });
}

/** Intentos de login registrados en la ventana de 15 min. */
export function loginsInWindow(now = Date.now()): number {
  if (!existsSync(LOGIN_LOG)) return 0;
  return readFileSync(LOGIN_LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { t: number })
    .filter((e) => now - e.t < WINDOW_MS).length;
}

/** Reserva 1 intento de login. Falla (en vez de arriesgar el 429) si se agoto el presupuesto. */
export function spendLogin(label: string): void {
  ensureDir();
  const used = loginsInWindow();
  if (used >= LOGIN_BUDGET) {
    throw new Error(
      `Presupuesto de logins agotado (${used}/${LOGIN_BUDGET} en 15 min). No se hace "${label}" para no pasar el rate limit.`,
    );
  }
  appendFileSync(LOGIN_LOG, JSON.stringify({ t: Date.now(), label }) + '\n');
}

// ---------------------------------------------------------------------------
// Estado persistente entre specs
// ---------------------------------------------------------------------------
export interface Q1State {
  /** Contrasena vigente de e2e-reset (tras AUTH-10). Nunca se imprime. */
  resetPassword?: string;
  /** Contrasena generada ANTES de enviar el reset (por si el test muere a mitad: la cuenta no queda sin clave conocida). */
  resetPasswordPending?: string;
  /** El token de reset ya se consumio (AUTH-10 hecho). */
  resetTokenConsumed?: boolean;
  /** La invitacion ya no esta pendiente (consumida por este arnes u otro). */
  inviteConsumed?: boolean;
  /** AUTH-11 creo la cuenta e2e-invitado en una corrida de este arnes. */
  inviteAcceptedHere?: boolean;
  /** storageState propio del owner abierto en AUTH-01 (ruta). */
  ownerSession?: string;
}

export function readState(): Q1State {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Q1State;
  } catch {
    return {};
  }
}

export function writeState(patch: Q1State): Q1State {
  ensureDir();
  const next = { ...readState(), ...patch };
  writeFileSync(STATE_FILE, JSON.stringify(next), { mode: 0o600 });
  // Copia por corrida (.artifacts/<runId>/) con la contrasena final de e2e-reset.
  const runId = process.env.E2E_RUN_ID;
  if (runId) {
    const dir = path.join(ARTIFACTS_DIR, runId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'q1-credentials.json'), JSON.stringify(next), { mode: 0o600 });
  }
  return next;
}

export function resetSessionFile(name: 'a' | 'b' | 'c'): string {
  ensureDir();
  return path.join(Q1_DIR, `reset-session-${name}.json`);
}

export function ownerSessionFile(): string {
  ensureDir();
  return path.join(Q1_DIR, 'owner-session.json');
}

/** Contrasena fuerte aleatoria (>=10, no numerica, no comun). */
export function newStrongPassword(): string {
  return `Q1-${randomBytes(9).toString('base64url')}-aA9!`;
}

// ---------------------------------------------------------------------------
// Entorno
// ---------------------------------------------------------------------------
export function resetToken(): string {
  return env('E2E_RESET_TOKEN');
}
export function inviteToken(): string {
  return env('E2E_INVITE_TOKEN');
}
export function inviteEmail(): string {
  return env('E2E_INVITE_EMAIL') || INVITE_EMAIL_DEFAULT;
}

/** Host de marketing de staging (stg.contan2.com), derivado del host del tenant. */
export function marketingBase(baseURL: string): string {
  const u = new URL(baseURL);
  const parts = u.hostname.split('.');
  // ccb.stg.contan2.com -> stg.contan2.com
  return `${u.protocol}//${parts.slice(1).join('.')}`;
}

// ---------------------------------------------------------------------------
// Login por UI
// ---------------------------------------------------------------------------
export async function fillLogin(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel(/^Contraseña/).fill(password);
}

export function note(testInfo: TestInfo, type: string, description: string): void {
  testInfo.annotations.push({ type, description });
}

/** Aviso estandar para cuentas/ tokens que ya no se pueden reproducir. */
export function skipConsumed(testInfo: TestInfo, what: string): void {
  note(testInfo, 'no-reproducible', `${what}: token consumido por una corrida anterior`);
}

/**
 * Login real por UI en un contexto nuevo (consume 1 intento del presupuesto). Guarda el storageState
 * en `file` (gitignored) y devuelve contexto y pagina ya dentro de /app.
 */
export async function loginInNewContext(
  browser: Browser,
  baseURL: string,
  email: string,
  password: string,
  file: string,
  label: string,
): Promise<{ context: BrowserContext; page: Page }> {
  spendLogin(label);
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
    locale: 'es-DO',
    timezoneId: 'America/Santo_Domingo',
  });
  const page = await context.newPage();
  await page.goto('/login');
  await fillLogin(page, email, password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
  await context.storageState({ path: file });
  return { context, page };
}
