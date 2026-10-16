// global-teardown.ts · limpieza por ledger (.artifacts/<runId>/created.ndjson -> created.json).
// Orden del plan: devolver prestamos -> cancelar reservas -> terminar inventario -> retirar ejemplares
// -> cancelar invitaciones -> quitar protocolo -> cancelar+borrar actividades -> archivar visitantes
// -> revertir identidad y test-tenant -> revocar sesiones.
// Cada entrada trae sus propios pasos de limpieza (los define el spec al crear el dato). Fallos tolerados.
// Solo staging. Sin PII ni cookies en el reporte. El purge SQL (provision/purge-staging.sql) es aparte.
import { request, type FullConfig } from '@playwright/test';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertStaging, BASE_URL, onlyProdReadonly, PLATFORM_URL } from './env';
import { CLEANUP_ORDER, ledgerDir, readLedger, type LedgerEntry } from './fixtures/data';
import { statePath } from './fixtures/roles';

interface StepResult {
  kind: string;
  label: string;
  step: string;
  status: number | 'error';
  attempts?: number;
}

// Throttle: la API limita las escrituras de actividades a 30/min por IP -> separamos las
// escrituras de actividades/asistencias >= 2.1 s. Ante 429, pausa (Retry-After o escalonada) y
// reintento, maximo 3 intentos por paso.
const WRITE_GAP_MS = 2_100;
const MAX_ATTEMPTS = 3;
const RETRY_PAUSE_MS = [8_000, 20_000, 35_000];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let lastThrottledWrite = 0;

function isThrottled(step: { method: string; path: string }): boolean {
  return step.method !== 'GET' && /\/activities|\/attendance|\/checkin/i.test(step.path);
}

function retryAfterMs(headers: Record<string, string>, attempt: number): number {
  const ra = Number(headers['retry-after']);
  const base = Number.isFinite(ra) && ra > 0 ? ra * 1000 : (RETRY_PAUSE_MS[attempt - 1] ?? 35_000);
  return Math.min(base + 500, 65_000);
}

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  if (onlyProdReadonly() || !process.env.E2E_RUN_ID) return;
  assertStaging(BASE_URL);
  const dir = ledgerDir();
  const entries = readLedger(dir);
  writeFileSync(path.join(dir, 'created.json'), JSON.stringify(entries, null, 2));
  if (!entries.length) {
    console.log('[e2e] teardown: ledger vacio, nada que limpiar.');
    return;
  }

  const results: StepResult[] = [];
  const uncleaned: LedgerEntry[] = [];
  const ordered: LedgerEntry[] = [...entries].sort(
    (a, b) => CLEANUP_ORDER.indexOf(a.kind) - CLEANUP_ORDER.indexOf(b.kind),
  );

  for (const entry of ordered) {
    const role = entry.role ?? 'owner';
    const state = statePath(entry.target === 'platform' ? 'platform' : role);
    const baseURL = entry.target === 'platform' ? PLATFORM_URL : BASE_URL;
    assertStaging(baseURL);
    if (!existsSync(state)) {
      results.push({ kind: entry.kind, label: entry.label, step: 'sin sesion', status: 'error' });
      uncleaned.push(entry);
      continue;
    }
    const ctx = await request.newContext({ baseURL, storageState: state });
    try {
      let entryOk = true;
      for (const step of entry.cleanup) {
        const stepName = `${step.method} ${step.path}`;
        let status: number | 'error' = 'error';
        let attempt = 0;
        while (attempt < MAX_ATTEMPTS) {
          attempt++;
          if (isThrottled(step)) {
            const wait = lastThrottledWrite + WRITE_GAP_MS - Date.now();
            if (wait > 0) await sleep(wait);
            lastThrottledWrite = Date.now();
          }
          try {
            const res = await ctx.fetch(step.path, {
              method: step.method,
              data: step.body === undefined ? undefined : (step.body as object),
              timeout: 20_000,
            });
            status = res.status();
            if (status === 429 && attempt < MAX_ATTEMPTS) {
              await sleep(retryAfterMs(res.headers(), attempt));
              continue;
            }
          } catch {
            status = 'error';
            if (attempt < MAX_ATTEMPTS) {
              await sleep(RETRY_PAUSE_MS[0]!);
              continue;
            }
          }
          break;
        }
        // 404/410 = ya no existe (idempotente); cualquier otro >=400 o error cuenta como fallo.
        const bad = status === 'error' || (status >= 400 && status !== 404 && status !== 410);
        if (bad) entryOk = false;
        results.push({ kind: entry.kind, label: entry.label, step: stepName, status, attempts: attempt });
      }
      if (!entryOk) uncleaned.push(entry);
    } finally {
      await ctx.dispose();
    }
  }

  const failed = results.filter(
    (r) => r.status === 'error' || (typeof r.status === 'number' && r.status >= 400 && r.status !== 404 && r.status !== 410),
  );
  writeFileSync(path.join(dir, 'teardown-report.json'), JSON.stringify({ results, failed: failed.length }, null, 2));
  // El ledger marca lo que NO se pudo limpiar (para el purge SQL / la proxima corrida).
  writeFileSync(path.join(dir, 'created.json'), JSON.stringify(entries.map((e) => ({ ...e, cleaned: !uncleaned.includes(e) })), null, 2));
  if (uncleaned.length) {
    writeFileSync(path.join(dir, 'uncleaned.json'), JSON.stringify(uncleaned.map(({ kind, label, id }) => ({ kind, label, id })), null, 2));
    console.log(`[e2e] teardown: ${uncleaned.length} entradas SIN limpiar (ver ${path.join(dir, 'uncleaned.json')}).`);
  }
  console.log(`[e2e] teardown: ${results.length} pasos, ${failed.length} con fallo (ver ${path.join(dir, 'teardown-report.json')}).`);
  if (failed.length) {
    console.log('[e2e] revisar con provision/purge-staging.sql (prefijo "[E2E] <runId>") ANTES de borrar nada.');
  }
}
