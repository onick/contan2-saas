// support/q5-biblio.ts · helpers de la ola Q5 (Biblioteca, SOLO staging).
// - Cliente fino sobre el BFF /app/biblioteca/api/* con la sesion del rol `biblioteca`.
// - Generadores de datos [E2E] (codigos, lectores, PNG de portada) + registro en el ledger.
// Nada de PII real: lectores = e2e+<runId>-lectorN@test.local, telefonos 809-555-01xx.
import type { APIRequestContext } from '@playwright/test';
import { deflateSync, crc32 } from 'node:zlib';
import { e2eEmail, e2ePhone, record, runId, tag, type LedgerKind } from '../fixtures/data';

export const BIB_API = '/app/biblioteca/api';

export interface ApiResult<T = any> {
  status: number;
  json: T;
}

/** Cliente del BFF de Biblioteca (misma sesion/cookies que el navegador del rol). */
export class BibApi {
  constructor(private readonly req: APIRequestContext) {}

  async call<T = any>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<ApiResult<T>> {
    const res = await this.req.fetch(`${BIB_API}${path}`, {
      method,
      data: body === undefined ? undefined : (body as object),
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      timeout: 30_000,
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status(), json };
  }

  get = <T = any>(p: string) => this.call<T>('GET', p);
  post = <T = any>(p: string, b?: unknown) => this.call<T>('POST', p, b ?? {});
  patch = <T = any>(p: string, b: unknown) => this.call<T>('PATCH', p, b);
}

// ---------------------------------------------------------------------------
// Nombres y codigos
// ---------------------------------------------------------------------------
/** Codigo de inventario E2E-<runId>-NN (el API lo guarda en mayusculas). Max 40 chars. */
export function itemCode(n: number): string {
  return `${runId()}-${String(n).padStart(2, '0')}`.toUpperCase();
}

export function titleName(suffix: string): string {
  return tag(suffix);
}

export interface TestReader {
  userId: string;
  code: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function readerIdentity(n: number): { firstName: string; lastName: string; email: string; phone: string } {
  return {
    firstName: `[E2E] Lector${n}`,
    lastName: runId(),
    email: e2eEmail(`lector${n}`),
    phone: e2ePhone(10 + n),
  };
}

// ---------------------------------------------------------------------------
// Ledger (limpieza en global-teardown; fallos tolerados)
// ---------------------------------------------------------------------------
export function ledgerLoan(inventoryCode: string): void {
  record({
    kind: 'loan',
    label: `prestamo ${inventoryCode}`,
    role: 'biblioteca',
    cleanup: [{ method: 'POST', path: `${BIB_API}/returns`, body: { inventoryCode } }],
  });
}
export function ledgerReservation(id: string): void {
  record({
    kind: 'reservation',
    label: `reserva ${id}`,
    id,
    role: 'biblioteca',
    cleanup: [{ method: 'POST', path: `${BIB_API}/reservations/${id}/cancel`, body: {} }],
  });
}
export function ledgerInventory(id: string): void {
  record({
    kind: 'inventory',
    label: `inventario ${id}`,
    id,
    role: 'biblioteca',
    cleanup: [{ method: 'POST', path: `${BIB_API}/inventories/${id}/finish`, body: {} }],
  });
}
const seenItems = new Set<string>();
export function ledgerItem(id: string, code: string): void {
  if (seenItems.has(id)) return;
  seenItems.add(id);
  record({
    kind: 'item',
    label: `ejemplar ${code}`,
    id,
    role: 'biblioteca',
    cleanup: [{ method: 'PATCH', path: `${BIB_API}/items/${id}`, body: { retiredReason: 'Limpieza E2E (QA automatizado)' } }],
  });
}
/** Lector del padron: archivar (soft) con owner. NUNCA se toca users.code. */
const seenReaders = new Set<string>();
export function ledgerReader(code: string): void {
  if (seenReaders.has(code)) return;
  seenReaders.add(code);
  record({
    kind: 'visitor' as LedgerKind,
    label: `lector ${code}`,
    role: 'owner',
    cleanup: [{ method: 'POST', path: `/app/usuarios/api/${encodeURIComponent(code)}/archive`, body: {} }],
  });
}

// ---------------------------------------------------------------------------
// Datos base
// ---------------------------------------------------------------------------
export interface Site {
  id: string;
  name: string;
}

/** Reutiliza un sitio "E2E-Sitio*" si existe (no hay API para borrar sitios); si no, lo crea. */
export async function ensureE2ESite(api: BibApi): Promise<Site> {
  const list = await api.get<{ sites: Array<{ id: string; name: string }> }>('/sites');
  const found = list.json?.sites?.find((s) => s.name.startsWith('E2E-Sitio'));
  if (found) return { id: found.id, name: found.name };
  const name = `E2E-Sitio ${runId()}`;
  const created = await api.post<{ site: { id: string; name: string } }>('/sites', { name });
  if (created.status !== 201) throw new Error(`no se pudo crear el sitio E2E (HTTP ${created.status})`);
  return { id: created.json.site.id, name: created.json.site.name };
}

export async function createTitle(
  api: BibApi,
  suffix: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; title: string }> {
  const title = titleName(suffix);
  const r = await api.post<{ title: { id: string } }>('/titles', {
    kind: 'libro',
    title,
    authors: ['Autora Prueba'],
    ...extra,
  });
  if (r.status !== 201) throw new Error(`createTitle(${suffix}) -> HTTP ${r.status}`);
  return { id: r.json.title.id, title };
}

export async function createItem(
  api: BibApi,
  titleId: string,
  n: number,
  site?: Site,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; code: string }> {
  const code = itemCode(n);
  const r = await api.post<{ id: string }>(`/titles/${titleId}/items`, {
    inventoryCode: code,
    siteId: site?.id ?? null,
    shelf: site ? 'Estante E2E-1' : null,
    physicalStatus: 'bueno',
    loanable: true,
    ...extra,
  });
  if (r.status !== 201) throw new Error(`createItem(${code}) -> HTTP ${r.status}`);
  ledgerItem(r.json.id, code);
  return { id: r.json.id, code };
}

export async function createReader(
  api: BibApi,
  n: number,
  readerType: 'empleado' | 'no_empleado' = 'no_empleado',
): Promise<TestReader> {
  const id = readerIdentity(n);
  const r = await api.post<{ reader: { userId: string; code: string } }>('/readers', {
    ...id,
    readerType,
    employeeCode: readerType === 'empleado' ? `EMP-E2E-${n}` : null,
  });
  if (r.status !== 201) throw new Error(`createReader(${n}) -> HTTP ${r.status}`);
  ledgerReader(r.json.reader.code);
  return { userId: r.json.reader.userId, code: r.json.reader.code, ...id };
}

export async function lend(
  api: BibApi,
  readerCode: string,
  inventoryCode: string,
  kind: 'domicilio' | 'sala' = 'domicilio',
): Promise<ApiResult> {
  const r = await api.post('/loans', { readerCode, inventoryCode, kind });
  if (r.status === 201) ledgerLoan(inventoryCode);
  return r;
}

// ---------------------------------------------------------------------------
// PNG valido minimo (RGB 16x24, color solido) para probar la portada multipart.
// ---------------------------------------------------------------------------
export function tinyPng(w = 16, h = 24, rgb: [number, number, number] = [200, 90, 20]): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
