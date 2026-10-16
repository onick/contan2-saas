// support/q2-common.ts · helpers de la ola Q2 (kiosko, escaner, RSVP: superficies publicas).
// - Throttle por archivo para los rate limits por IP de los endpoints publicos (check-in 10/min,
//   busqueda 30/min, RSVP 10/min, PIN 8/min). Es una ventana deslizante conservadora, compartida
//   entre corridas (archivo fijo en .artifacts) y entre workers.
// - Datos [E2E] con reintento ante 429 de escrituras de actividades (30/min compartidos).
// - Hallazgos: registro jsonl en .artifacts/q2 para el informe (sin PII).
// Solo staging. Nunca imprime cookies, tokens ni el PIN.
import type { APIRequestContext, Page } from '@playwright/test';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR } from '../env';
import { statePath } from '../fixtures/roles';
import { createActivity, createVisitor, jsonOf, type CreatedActivity, type CreatedVisitor } from './q3-api';

// ---------------------------------------------------------------------------
// Throttle
// ---------------------------------------------------------------------------
export type Bucket = 'checkin' | 'lookup' | 'rsvp' | 'pin' | 'activity-write';

/** Maximo por ventana de 60 s, con margen bajo el limite real de la API. */
const LIMITS: Record<Bucket, number> = {
  checkin: 8, // real 10/min por org+IP (kiosko y escaner comparten /public/checkin)
  lookup: 24, // real 30/min (lookup + suggest comparten limiter)
  rsvp: 8, // real 10/min
  pin: 4, // real 8/min; ademas el plan limita a <=4 intentos en toda la corrida
  'activity-write': 10, // real 30/min compartidos con otros agentes; el plan pide <=15/min
};

const FILE = path.join(ARTIFACTS_DIR, 'q2-throttle.ndjson');

function recent(bucket: Bucket, now: number): number[] {
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { b: Bucket; t: number })
    .filter((e) => e.b === bucket && now - e.t < 60_000)
    .map((e) => e.t)
    .sort((a, b) => a - b);
}

/** Reserva `n` usos del bucket; espera lo necesario para no pasar el limite por minuto. */
export async function spend(bucket: Bucket, n = 1): Promise<void> {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const limit = LIMITS[bucket];
  for (;;) {
    const now = Date.now();
    const ts = recent(bucket, now);
    if (ts.length + n <= limit) {
      const lines = Array.from({ length: n }, () => JSON.stringify({ b: bucket, t: Date.now() })).join('\n') + '\n';
      appendFileSync(FILE, lines);
      return;
    }
    // Espera a que expire el uso mas viejo que libera cupo suficiente.
    const idx = ts.length + n - limit - 1;
    const waitMs = Math.max(500, 60_000 - (now - ts[Math.min(idx, ts.length - 1)]!) + 250);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 15_000)));
  }
}

// ---------------------------------------------------------------------------
// Datos [E2E]
// ---------------------------------------------------------------------------
const PROJECT_IDX: Record<string, number> = { 'webkit-tablet': 0, 'desktop-1440': 1, 'mobile-390': 2, 'tablet-820': 3 };

/** n unico por proyecto/slot (emails e2e+<runId>-<n>, telefonos 809-555-01xx). */
export function slotN(projectName: string, slot: number): number {
  return 200 + (PROJECT_IDX[projectName] ?? 4) * 40 + slot;
}

async function retry429<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!/HTTP 429/.test(String((e as Error).message))) throw e;
      await new Promise((r) => setTimeout(r, 25_000));
    }
  }
  throw new Error(`${label}: 429 persistente (${String((last as Error)?.message)})`);
}

/** Actividad [E2E] abierta hoy (cupo/audiencia a eleccion). Idempotente por nombre. */
export async function q2Activity(
  api: APIRequestContext,
  label: string,
  opts: { capacity?: number; audience?: 'adultos' | 'infantil' } = {},
): Promise<CreatedActivity> {
  await spend('activity-write');
  return retry429(`actividad ${label}`, () => createActivity(api, label, { capacity: 3, ...opts }));
}

/** Visitante [E2E] con email/telefono ficticios. Idempotente por (runId, n). */
export async function q2Visitor(api: APIRequestContext, projectName: string, slot: number, label = 'Visitante'): Promise<CreatedVisitor> {
  await spend('activity-write');
  return retry429(`visitante ${slot}`, () => createVisitor(api, slotN(projectName, slot), label));
}

/** Cancela y borra una actividad [E2E] con throttle y reintento ante 429 (limite de escrituras compartido). */
export async function dropActivity(api: APIRequestContext, id: string): Promise<void> {
  const once = async (call: () => Promise<{ status(): number }>) => {
    for (let i = 0; i < 5; i++) {
      const res = await call().catch(() => null);
      if (!res || res.status() !== 429) return;
      await new Promise((r) => setTimeout(r, 20_000));
    }
  };
  await spend('activity-write', 2);
  await once(() => api.patch(`/app/actividades/api/${id}/status`, { data: { status: 'cancelada' } }));
  await once(() => api.delete(`/app/actividades/api/${id}`));
}

/** Asistencias activas de una actividad (owner): para verificar efectos reales en la DB. */
export async function checkedIn(api: APIRequestContext, activityId: string) {
  return jsonOf<{ items: Array<{ id: string; userCode: string | null; anonymous: boolean; companionsAdults: number; companionsChildren: number }>; total: number }>(
    await api.get(`/app/check-in/api/recent?activityId=${activityId}&status=checked_in&limit=100`),
  );
}

/** Conteo publico de inscritos de una actividad (lo que ve el visitante), via /kiosko SSR no; via owner. */
export async function enrolledOf(api: APIRequestContext, activityId: string): Promise<number | null> {
  const res = await api.get('/app/check-in/api/activities');
  const body = await jsonOf<{ items?: Array<{ id: string; enrolledCount?: number; enrolled?: number }> }>(res);
  const a = body.items?.find((x) => x.id === activityId);
  return a ? (a.enrolledCount ?? a.enrolled ?? null) : null;
}

/** Check-in publico directo (para dejar una actividad llena / registrar a alguien sin pasar por la UI). */
export async function publicCheckin(
  baseURL: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const { request } = await import('@playwright/test');
  await spend('checkin');
  const ctx = await request.newContext({ baseURL });
  try {
    const res = await ctx.post('/kiosko/checkin', { data: body });
    return { status: res.status(), json: await jsonOf(res) };
  } finally {
    await ctx.dispose();
  }
}

// ---------------------------------------------------------------------------
// Hallazgos (jsonl; sin PII)
// ---------------------------------------------------------------------------
export function finding(id: string, data: Record<string, unknown>): void {
  try {
    const dir = path.join(ARTIFACTS_DIR, 'q2');
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, 'findings.jsonl'), JSON.stringify({ id, t: new Date().toISOString(), ...data }) + '\n');
  } catch {
    /* nunca rompe un test */
  }
}

// ---------------------------------------------------------------------------
// UI del kiosko
// ---------------------------------------------------------------------------
export const SCANNER_STATE = statePath('scanner');
export const NO_STATE = { cookies: [], origins: [] };

export async function openKiosk(page: Page): Promise<void> {
  const res = await page.goto('/kiosko');
  if ((res?.status() ?? 0) >= 400) throw new Error(`GET /kiosko -> ${res?.status()}`);
  await page.getByTestId('kiosk-step-welcome').waitFor();
}

/** Bienvenida -> lista -> tarjeta de la actividad -> pantalla "identificacion". */
export async function pickActivity(page: Page, activityName: string): Promise<void> {
  await page.getByRole('button', { name: 'Toca para registrarte' }).click();
  await page.getByTestId('kiosk-step-activity').waitFor();
  await page.getByRole('button', { name: new RegExp(escapeRe(activityName)) }).click();
  await page.getByTestId('kiosk-step-identify').waitFor();
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Respaldo: guarda el estado de un test para el informe. */
export function writeJson(file: string, data: unknown): void {
  const dir = path.join(ARTIFACTS_DIR, 'q2');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

/** Hallazgo no bloqueante: queda como annotation del test y en findings.jsonl (sin PII). */
export function note(
  testInfo: { annotations: Array<{ type: string; description?: string }> },
  id: string,
  severity: 'S0' | 'S1' | 'S2' | 'S3',
  text: string,
): void {
  testInfo.annotations.push({ type: `hallazgo ${severity}`, description: `${id}: ${text}` });
  finding(id, { severity, text });
}
