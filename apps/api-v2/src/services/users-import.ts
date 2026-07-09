// apps/api-v2/src/services/users-import.ts · importación de visitantes en lote
// (PR-I1). Dos fases: clasificación (preview, SIN escrituras) y commit (inserta
// SÓLO las filas nuevas). Acepta CSV y Excel (.xlsx).
//
// INVARIANTE CENTRAL · NUNCA SOBREESCRIBE un visitante existente. Defensa en
// profundidad: (1) la clasificación marca `duplicate` toda fila cuyo email ya
// está en el centro; (2) el commit sólo hace INSERT de filas `new` — jamás un
// UPDATE; (3) la unique constraint (organization_id, lower(email)) de la DB es
// el último cerrojo ante una carrera (la fila falla sola, no pisa a nadie).
//
// Credenciales: el import NO envía credenciales (decisión de producto) — eso es
// un paso aparte (bulk-send / cohorte noCredential).

import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { withTenant, type DbClient } from '@contan2/db';
import { generateUserCode } from '@contan2/codes';

export const IMPORT_ROW_CAP = 1000; // tope por archivo (alineado con bulk-credentials)
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB (igual que el multipart del plugin)

// Encabezados canónicos de la plantilla (los que el admin descarga).
const TEMPLATE_HEADERS = ['Nombre', 'Apellido', 'Email', 'Teléfono'] as const;
const TEMPLATE_EXAMPLE = ['María', 'Pérez', 'maria.perez@correo.com', '809-555-0123'] as const;

// Plantilla de importación: CSV (BOM) o XLSX con headers + 1 fila de ejemplo.
export async function buildImportTemplate(format: 'csv' | 'xlsx'): Promise<{ body: Buffer | string; contentType: string; filename: string }> {
  if (format === 'csv') {
    const esc = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
    const body = '﻿' + [TEMPLATE_HEADERS, TEMPLATE_EXAMPLE].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
    return { body, contentType: 'text/csv; charset=utf-8', filename: 'plantilla-visitantes.csv' };
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Visitantes');
  ws.columns = [{ width: 20 }, { width: 20 }, { width: 30 }, { width: 18 }];
  const head = ws.addRow([...TEMPLATE_HEADERS]);
  head.font = { bold: true };
  head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF2F5' } }; });
  ws.addRow([...TEMPLATE_EXAMPLE]);
  const body = Buffer.from(await wb.xlsx.writeBuffer()) as Buffer;
  return { body, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'plantilla-visitantes.xlsx' };
}

export type ImportRowStatus = 'new' | 'duplicate' | 'duplicate-in-file' | 'invalid';

export interface ClassifiedRow {
  rowNum: number;        // fila en el archivo (1 = primera de datos)
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: ImportRowStatus;
  reason?: string;       // por qué inválida / duplicada
  nameWarning?: boolean; // mismo nombre+apellido ya existe (posible doble; NO bloquea)
}

export interface ImportSummary {
  total: number;         // filas de datos no vacías
  new: number;
  duplicates: number;    // duplicate + duplicate-in-file
  invalid: number;
  nameWarnings: number;
}

export interface ClassifyResult {
  rows: ClassifiedRow[];
  summary: ImportSummary;
  truncated: boolean;    // el archivo excedía IMPORT_ROW_CAP
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const norm = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_-]+/g, '');

// Alias de encabezados (normalizados) → campo canónico.
const HEADER_ALIASES: Record<string, 'firstName' | 'lastName' | 'email' | 'phone' | 'code'> = {};
for (const a of ['nombre', 'nombres', 'firstname', 'first', 'name']) HEADER_ALIASES[norm(a)] = 'firstName';
for (const a of ['apellido', 'apellidos', 'lastname', 'last', 'surname']) HEADER_ALIASES[norm(a)] = 'lastName';
for (const a of ['email', 'correo', 'mail', 'correoelectronico', 'e-mail']) HEADER_ALIASES[norm(a)] = 'email';
for (const a of ['telefono', 'phone', 'celular', 'movil', 'tel', 'whatsapp']) HEADER_ALIASES[norm(a)] = 'phone';
// 'Código' es opcional: identifica a un usuario YA existente (import de invitados
// lo usa para invitar al registro real sin crear duplicados). El import de
// usuarios lo ignora (los códigos se generan al crear).
for (const a of ['codigo', 'código', 'code', 'cod']) HEADER_ALIASES[norm(a)] = 'code';

export interface RawRow { rowNum: number; firstName: string; lastName: string; email: string; phone: string; code?: string }
export interface ParseResult { rows: RawRow[]; error?: string }

// Normaliza + valida una fila cruda (trim, recorte, email lower). Devuelve el
// email canónico (lower) o null, y `invalidReason` si la fila no sirve. Fuente
// de verdad compartida entre el import de usuarios y el de invitados.
export interface NormalizedRow { firstName: string; lastName: string; email: string | null; phone: string | null; code: string | null; invalidReason?: string }
export function normalizeRow(row: RawRow): NormalizedRow {
  const firstName = row.firstName.trim().slice(0, 120);
  const lastName = row.lastName.trim().slice(0, 120);
  const emailRaw = row.email.trim().toLowerCase();
  const phone = row.phone.trim().slice(0, 40) || null;
  const code = (row.code ?? '').trim().toUpperCase().slice(0, 40) || null;
  let invalidReason: string | undefined;
  if (!firstName || !lastName) invalidReason = 'Falta nombre o apellido.';
  else if (emailRaw && !EMAIL_RE.test(emailRaw)) invalidReason = 'Correo con formato inválido.';
  return { firstName, lastName, email: emailRaw || null, phone, code, invalidReason };
}

// Nombre completo normalizado (sin acentos/espacios) para el aviso de doble.
export const fullNameKey = (first: string, last: string): string => norm(`${first} ${last}`);

// ── Parse CSV (RFC4180-ish: comillas, comas internas, "" escapada, CRLF/LF, BOM)
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c === '\r') {
      // se ignora; el \n siguiente cierra la fila
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

async function parseXlsx(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  // cast: el Buffer genérico de Node 22 vs el que declara exceljs (mismo bytes).
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values as unknown[]; // 1-indexed (vals[0] vacío)
    const cells: string[] = [];
    for (let i = 1; i < vals.length; i += 1) {
      cells.push(cellToString(vals[i]));
    }
    out.push(cells);
  });
  return out;
}

// Coacciona una celda de Excel a texto: número, fecha, rich text, hyperlink, etc.
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;                       // hyperlink/rich
    if (typeof o.result === 'string' || typeof o.result === 'number') return String(o.result); // fórmula
    if (Array.isArray(o.richText)) return o.richText.map((p) => (p as { text?: string }).text ?? '').join('');
  }
  return String(v);
}

// Detecta formato por magic bytes (xlsx = zip 'PK') / extensión, y parsea a
// filas crudas {firstName,lastName,email,phone} mapeando el header.
export async function parseUsersFile(buf: Buffer, filename: string): Promise<ParseResult> {
  const isXlsx = (buf[0] === 0x50 && buf[1] === 0x4b) || /\.xlsx$/i.test(filename);
  let matrix: string[][];
  try {
    matrix = isXlsx ? await parseXlsx(buf) : parseCsv(buf.toString('utf8'));
  } catch {
    return { rows: [], error: 'No pudimos leer el archivo. Verificá que sea un CSV o Excel válido.' };
  }
  // Primera fila NO vacía = encabezado.
  const headerIdx = matrix.findIndex((r) => r.some((c) => c.trim() !== ''));
  if (headerIdx === -1) return { rows: [], error: 'El archivo está vacío.' };
  const header = matrix[headerIdx]!.map((h) => HEADER_ALIASES[norm(h)] ?? null);
  if (!header.includes('firstName') || !header.includes('lastName')) {
    return { rows: [], error: 'No reconocimos las columnas. Usá la plantilla (Nombre, Apellido, Email, Teléfono).' };
  }
  const col = (name: 'firstName' | 'lastName' | 'email' | 'phone' | 'code') => header.indexOf(name);
  const ci = { firstName: col('firstName'), lastName: col('lastName'), email: col('email'), phone: col('phone'), code: col('code') };

  const rows: RawRow[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const r = matrix[i]!;
    const get = (idx: number) => (idx >= 0 && idx < r.length ? (r[idx] ?? '').trim() : '');
    const firstName = get(ci.firstName);
    const lastName = get(ci.lastName);
    const email = get(ci.email);
    const phone = get(ci.phone);
    const code = get(ci.code);
    if (!firstName && !lastName && !email && !phone && !code) continue; // fila vacía → ignorar
    rows.push({ rowNum: rows.length + 1, firstName, lastName, email, phone, code });
  }
  return { rows };
}

// ── Clasificación (preview · SIN escrituras) ─────────────────────────────────
// Valida cada fila, deduplica DENTRO del archivo (primer email gana) y CONTRA la
// DB (email ya existente → `duplicate`, nunca se tocará). Marca aviso por nombre.
export async function classifyRows(db: DbClient, orgId: string, raw: RawRow[]): Promise<ClassifyResult> {
  const truncated = raw.length > IMPORT_ROW_CAP;
  const slice = raw.slice(0, IMPORT_ROW_CAP);

  // Normaliza + valida formato, deja el email canónico (lower) para dedup.
  const normd = slice.map((row) => ({ row, ...normalizeRow(row) }));

  // Dedup contra DB en SET (no N+1): emails y nombres completos existentes.
  const emails = [...new Set(normd.filter((n) => n.email && !n.invalidReason).map((n) => n.email!))];
  const dbEmails = new Set<string>();
  if (emails.length > 0) {
    for (let i = 0; i < emails.length; i += 500) {
      const chunk = emails.slice(i, i + 500);
      const found = await db.selectFrom('users').select('email')
        .where('organization_id', '=', orgId)
        .where('email', 'in', chunk)
        .execute();
      for (const r of found) if (r.email) dbEmails.add(r.email.toLowerCase());
    }
  }
  // Nombres completos existentes (para el aviso de posible doble).
  const dbNames = new Set<string>();
  const allNames = await db.selectFrom('users').select(['first_name', 'last_name'])
    .where('organization_id', '=', orgId).where('deleted_at', 'is', null).execute();
  for (const r of allNames) dbNames.add(norm(`${r.first_name} ${r.last_name}`));

  const seenInFile = new Set<string>();
  const rows: ClassifiedRow[] = [];
  const summary: ImportSummary = { total: normd.length, new: 0, duplicates: 0, invalid: 0, nameWarnings: 0 };

  for (const n of normd) {
    const base = { rowNum: n.row.rowNum, firstName: n.firstName, lastName: n.lastName, email: n.email, phone: n.phone };
    if (n.invalidReason) {
      rows.push({ ...base, status: 'invalid', reason: n.invalidReason });
      summary.invalid += 1;
      continue;
    }
    if (n.email && seenInFile.has(n.email)) {
      rows.push({ ...base, status: 'duplicate-in-file', reason: 'Correo repetido en el archivo.' });
      summary.duplicates += 1;
      continue;
    }
    if (n.email && dbEmails.has(n.email)) {
      rows.push({ ...base, status: 'duplicate', reason: 'Ya existe un visitante con ese correo.' });
      summary.duplicates += 1;
      continue;
    }
    if (n.email) seenInFile.add(n.email);
    const nameWarning = dbNames.has(norm(`${n.firstName} ${n.lastName}`));
    rows.push({ ...base, status: 'new', ...(nameWarning ? { nameWarning: true } : {}) });
    summary.new += 1;
    if (nameWarning) summary.nameWarnings += 1;
  }

  return { rows, summary, truncated };
}

// ── Commit (inserta SÓLO las `new`) ──────────────────────────────────────────
export interface CommitResult { created: number; skipped: number; failed: number }

// Inserta cada fila `new` en su propia transacción corta (aislamiento: una fila
// que falle no afecta a las demás). RE-VERIFICA el email contra la DB dentro de
// la tx; si existe (carrera entre preview y commit) → skipped, NUNCA UPDATE.
export async function commitNewRows(
  db: DbClient,
  orgId: string,
  codePrefix: string,
  staff: { id: string; email: string; role: string },
  rows: ClassifiedRow[],
  ip: string | null,
  ua: string | null,
): Promise<CommitResult> {
  const out: CommitResult = { created: 0, skipped: 0, failed: 0 };
  const newRows = rows.filter((r) => r.status === 'new');

  for (const r of newRows) {
    try {
      const inserted = await withTenant(db, orgId, async (tx) => {
        // Cerrojo 2: re-verificar el email; si ya existe, NO insertar (ni pisar).
        if (r.email) {
          const exists = await tx.selectFrom('users').select('id')
            .where('organization_id', '=', orgId).where('email', '=', r.email)
            .executeTakeFirst();
          if (exists) return null; // skipped
        }
        let row: { id: string } | undefined;
        for (let attempt = 0; attempt < 5 && !row; attempt += 1) {
          row = await tx.insertInto('users').values({
            id: randomUUID(),
            organization_id: orgId,
            code: generateUserCode(codePrefix),
            first_name: r.firstName,
            last_name: r.lastName,
            email: r.email,
            phone: r.phone,
            visit_count: 0,
          })
            .onConflict((oc) => oc.columns(['organization_id', 'code']).doNothing())
            .returning('id')
            .executeTakeFirst();
        }
        if (!row) throw new Error('CODE_EXHAUSTED');
        return row;
      });
      if (inserted) out.created += 1; else out.skipped += 1;
    } catch {
      // Cerrojo 3: violación de unique de email (carrera) u otro error → la fila
      // falla SOLA, sin abortar el resto ni sobreescribir nada.
      out.failed += 1;
    }
  }

  // Auditoría agregada (sin PII): una fila por import.
  await db.insertInto('tenant_audit_log').values({
    organization_id: orgId,
    actor_staff_id: staff.id,
    actor_email_masked: null,
    actor_role: staff.role,
    action: 'users.imported',
    target_type: 'users',
    target_id: 'import',
    target_label: null,
    metadata: JSON.stringify({ created: out.created, skipped: out.skipped, failed: out.failed }),
  }).execute();

  return out;
}
