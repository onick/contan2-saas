// fixtures/data.ts · datos de prueba con prefijo [E2E] + ledger de lo creado.
// runId: E2E-<yyyyMMdd-HHmm>-<rand4>. Lo genera global-setup y lo hereda cada worker via env.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR } from '../env';

export function newRunId(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `E2E-${stamp}-${rand}`;
}

export function runId(): string {
  const id = process.env.E2E_RUN_ID;
  // `playwright test --list` carga los specs sin correr global-setup: un runId ficticio basta (no escribe nada).
  if (!id && process.argv.includes('--list')) return 'E2E-LIST';
  if (!id) throw new Error('E2E_RUN_ID no definido: global-setup no corrio.');
  return id;
}

/** "[E2E] <runId> <nombre>" -- prefijo obligatorio de todo dato creado. */
export function tag(name: string): string {
  return `[E2E] ${runId()} ${name}`;
}

/** e2e+<runId>-<n>@test.local (en minusculas; el runId lleva guiones). */
export function e2eEmail(n: number | string): string {
  return `e2e+${runId().toLowerCase()}-${n}@test.local`;
}

/** 809-555-01xx (rango ficticio). */
export function e2ePhone(n: number): string {
  return `809-555-01${String(Math.abs(n) % 100).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Ledger. Orden de limpieza del plan (global-teardown lo respeta).
// ---------------------------------------------------------------------------
export const CLEANUP_ORDER = [
  'loan', // devolver prestamos
  'reservation', // cancelar reservas
  'inventory', // terminar inventario E2E-Sitio
  'item', // retirar ejemplares
  'invitation', // cancelar invitaciones
  'protocol', // quitar protocolo
  'activity', // cancelar + borrar actividades
  'visitor', // archivar visitantes
  'identity', // revertir identidad
  'tenant', // revertir test-tenant
  'session', // revocar sesiones
] as const;
export type LedgerKind = (typeof CLEANUP_ORDER)[number];

export interface CleanupStep {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Ruta same-origin (relativa al baseURL del rol). */
  path: string;
  body?: unknown;
}

export interface LedgerEntry {
  kind: LedgerKind;
  /** Etiqueta legible, sin PII. */
  label: string;
  id?: string;
  /** Rol cuya sesion ejecuta la limpieza (default owner). */
  role?: 'owner' | 'admin' | 'puerta' | 'biblioteca';
  /** Host al que apuntan los pasos (default tenant). */
  target?: 'tenant' | 'platform';
  /** Pasos en orden; fallos tolerados (se reportan). El spec los define al crear el dato. */
  cleanup: CleanupStep[];
  at?: string;
}

export function ledgerDir(): string {
  return path.join(ARTIFACTS_DIR, runId());
}

/** Append-only (ndjson): seguro con varios workers. global-teardown consolida a created.json. */
export function record(entry: LedgerEntry): void {
  const dir = ledgerDir();
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, 'created.ndjson'), JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n');
}

export function readLedger(dir = ledgerDir()): LedgerEntry[] {
  const f = path.join(dir, 'created.ndjson');
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LedgerEntry);
}
