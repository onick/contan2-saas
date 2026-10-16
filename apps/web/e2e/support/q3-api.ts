// support/q3-api.ts · helpers de Q3 (admin core + RBAC): clientes API por rol, datos [E2E]
// con ledger de limpieza, PNG sintetico para portadas, utilidades de enmascarado.
// Solo staging (assertStaging). Nunca imprime cookies ni tokens.
import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertStaging, BASE_URL } from '../env';
import { e2eEmail, e2ePhone, ledgerDir, record, tag } from '../fixtures/data';
import { statePath, type Role } from '../fixtures/roles';

/** Cliente API con la sesion (storageState) de un rol. Cerrar con dispose(). */
export async function apiFor(role: Role, baseURL = BASE_URL): Promise<APIRequestContext> {
  assertStaging(baseURL);
  return request.newContext({ baseURL, storageState: statePath(role), extraHTTPHeaders: { accept: 'application/json' } });
}

// ---------------------------------------------------------------------------
// PNG sintetico (RGB, sin dependencias). Para portadas de prueba.
// ---------------------------------------------------------------------------
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function makePng(width = 800, height = 450, rgb: [number, number, number] = [243, 146, 40]): Buffer {
  const row = Buffer.alloc(1 + width * 3);
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y++) {
    const off = y * row.length;
    raw[off] = 0;
    for (let x = 0; x < width; x++) {
      const stripe = (Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0;
      const p = off + 1 + x * 3;
      raw[p] = stripe ? rgb[0] : 255 - rgb[0] / 2;
      raw[p + 1] = stripe ? rgb[1] : 255 - rgb[1] / 2;
      raw[p + 2] = stripe ? rgb[2] : 255 - rgb[2] / 2;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Datos [E2E]
// ---------------------------------------------------------------------------
export async function jsonOf<T = Record<string, unknown>>(res: APIResponse): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

export interface CreatedActivity {
  id: string;
  name: string;
  imageUrl: string | null;
}

/** Crea una actividad [E2E] con portada (POST with-cover) y la registra en el ledger. */
export async function createActivity(
  api: APIRequestContext,
  label: string,
  opts: { capacity?: number; audience?: 'adultos' | 'infantil'; startInMin?: number; durationMin?: number } = {},
): Promise<CreatedActivity> {
  const name = tag(label);
  // Idempotente por nombre (worker reiniciado tras un fallo): reutiliza la actividad activa existente.
  const existing = await jsonOf<{ items?: Array<{ id: string; name: string; imageUrl?: string | null }> }>(
    await api.get('/app/check-in/api/activities'),
  );
  const prior = existing.items?.find((a) => a.name === name);
  if (prior) return { id: prior.id, name, imageUrl: prior.imageUrl ?? null };
  const start = new Date(Date.now() + (opts.startInMin ?? 3) * 60_000);
  const end = new Date(start.getTime() + (opts.durationMin ?? 180) * 60_000);
  const res = await api.post('/app/actividades/api/with-cover', {
    multipart: {
      name,
      type: 'otro',
      location: 'Sala E2E',
      date: start.toISOString(),
      endDate: end.toISOString(),
      capacity: String(opts.capacity ?? 20),
      audience: opts.audience ?? 'adultos',
      cover: { name: 'cover.png', mimeType: 'image/png', buffer: makePng() },
    },
  });
  if (res.status() !== 201) throw new Error(`createActivity ${label}: HTTP ${res.status()}`);
  const body = await jsonOf<{ activity: { id: string; imageUrl?: string | null } }>(res);
  const id = body.activity.id;
  trackActivity(id, name);
  return { id, name, imageUrl: body.activity.imageUrl ?? null };
}

/** Registra una actividad en el ledger: cancelar -> borrar (el teardown tolera fallos). */
export function trackActivity(id: string, label: string): void {
  record({
    kind: 'activity',
    label,
    id,
    cleanup: [
      { method: 'PATCH', path: `/app/actividades/api/${id}/status`, body: { status: 'cancelada' } },
      { method: 'DELETE', path: `/app/actividades/api/${id}` },
    ],
  });
}

export interface CreatedVisitor {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/**
 * Alta de visitante [E2E] (POST /usuarios/api). Se archiva en el teardown.
 * Idempotente por (runId, n): si el correo ya existe (worker reiniciado tras un fallo) lo reutiliza.
 */
export async function createVisitor(api: APIRequestContext, n: number, label = 'Visitante'): Promise<CreatedVisitor> {
  const firstName = tag(label);
  const lastName = `Prueba${n}`;
  const email = e2eEmail(n);
  const phone = e2ePhone(n);
  const res = await api.post('/app/usuarios/api', { data: { firstName, lastName, email, phone } });
  if (res.status() === 409) {
    const found = await jsonOf<{ items: Array<{ id: string; code: string; email: string | null }> }>(
      await api.get(`/app/check-in/api/visitors?q=${encodeURIComponent(email)}`),
    );
    const hit = found.items?.find((v) => (v.email ?? '').toLowerCase() === email.toLowerCase());
    if (!hit) throw new Error(`createVisitor ${n}: 409 y no se encontro el existente`);
    return { id: hit.id, code: hit.code, firstName, lastName, email, phone };
  }
  if (res.status() !== 201) throw new Error(`createVisitor ${n}: HTTP ${res.status()}`);
  const body = await jsonOf<{ user: { id: string; code: string }; credential: string }>(res);
  trackVisitor(body.user.code, `${firstName} ${lastName}`);
  return { id: body.user.id, code: body.user.code, firstName, lastName, email, phone };
}

export function trackVisitor(code: string, label: string): void {
  record({ kind: 'visitor', label, id: code, cleanup: [{ method: 'POST', path: `/app/usuarios/api/${code}/archive` }] });
}

export function trackProtocol(userId: string, label: string): void {
  record({ kind: 'protocol', label, id: userId, cleanup: [{ method: 'DELETE', path: `/app/protocolo/api/${userId}` }] });
}

/** Fecha/hora local America/Santo_Domingo (YYYY-MM-DD) de "hoy". */
export function todayDR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
}

/** UUID v4 inexistente: para probar permisos sin escribir nada. */
export function fakeUuid(): string {
  return '00000000-0000-4000-8000-000000000e2e';
}

/**
 * Fixture de archivo por corrida: un worker que se reinicia tras un test fallido (bug real documentado)
 * NO debe repetir el alta de datos (rate limits, duplicados). Guarda el resultado en el directorio del run.
 */
export async function cachedFixture<T>(name: string, factory: () => Promise<T>): Promise<T> {
  const dir = ledgerDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `q3-${name}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T;
  const value = await factory();
  writeFileSync(file, JSON.stringify(value));
  return value;
}

/**
 * Reintenta UNA vez tras 62 s si el rate limit por minuto (import 3/min, export 6/min, etc.) responde 429.
 * Es un limite de la API compartido con otros agentes, no un defecto: no cuenta como fallo.
 */
export async function withRateLimitRetry(call: () => Promise<APIResponse>): Promise<APIResponse> {
  const first = await call();
  if (first.status() !== 429) return first;
  await new Promise((r) => setTimeout(r, 62_000));
  return call();
}
