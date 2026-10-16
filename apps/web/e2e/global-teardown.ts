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
      continue;
    }
    const ctx = await request.newContext({ baseURL, storageState: state });
    try {
      for (const step of entry.cleanup) {
        const stepName = `${step.method} ${step.path}`;
        try {
          const res = await ctx.fetch(step.path, {
            method: step.method,
            data: step.body === undefined ? undefined : (step.body as object),
            timeout: 20_000,
          });
          results.push({ kind: entry.kind, label: entry.label, step: stepName, status: res.status() });
        } catch {
          results.push({ kind: entry.kind, label: entry.label, step: stepName, status: 'error' });
        }
      }
    } finally {
      await ctx.dispose();
    }
  }

  const failed = results.filter((r) => r.status === 'error' || (typeof r.status === 'number' && r.status >= 400));
  writeFileSync(path.join(dir, 'teardown-report.json'), JSON.stringify({ results, failed: failed.length }, null, 2));
  console.log(`[e2e] teardown: ${results.length} pasos, ${failed.length} con fallo (ver ${path.join(dir, 'teardown-report.json')}).`);
  if (failed.length) {
    console.log('[e2e] revisar con provision/purge-staging.sql (prefijo "[E2E] <runId>") ANTES de borrar nada.');
  }
}
