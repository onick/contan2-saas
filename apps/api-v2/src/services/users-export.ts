// apps/api-v2/src/services/users-export.ts · exportación del padrón de
// visitantes (PR-E1). Carga set-based (sin N+1) honrando los MISMOS filtros del
// listado (cohorte/estado/búsqueda) o el padrón completo (scope=all), y serializa
// a CSV saneado o a un workbook ExcelJS branded con la identidad del tenant.
//
// PII masiva → la ruta lo gatea a owner/admin y lo audita. Tope duro de filas
// con aviso honesto (sin truncado silencioso).

import ExcelJS from 'exceljs';
import type { DbClient } from '@contan2/db';
import type { UserCohort } from '@contan2/contracts';
import { cohortCondition, statusCondition } from './users-query.js';
import { generatePalette, pickOn } from './branding-tokens.js';
import { loadLogoDataUri } from './credential.js';
import { CSV_BOM, csvRow } from './csv.js';
import { likeContains, type UserStatusFilter } from '../query.js';

// Tope duro: protege memoria/tiempo en padrones grandes. Si el universo excede,
// se exportan las primeras N (orden estable) y la ruta lo reporta.
export const USERS_EXPORT_CAP = 50_000;

export interface UsersExportParams {
  cohort: UserCohort;
  status: UserStatusFilter;
  search?: string;
  // 'view' = aplica cohorte+búsqueda+estado (lo que el admin está viendo).
  // 'all'  = ignora cohorte+búsqueda; respeta SÓLO el estado (padrón completo).
  scope: 'view' | 'all';
}

export interface UserExportRow {
  code: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  visitCount: number;
  lastVisitAt: Date | null;
  credentialSentAt: Date | null;
  archived: boolean;
  createdAt: Date;
}

const COLUMNS = [
  'Código', 'Nombre', 'Apellido', 'Email', 'Teléfono',
  'Visitas', 'Última visita', 'Credencial enviada', 'Estado', 'Fecha de registro',
] as const;

const FMT = new Intl.DateTimeFormat('es-DO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santo_Domingo' });
const fmt = (d: Date | null): string => (d ? FMT.format(d) : '');

// Carga las filas del padrón honrando los filtros. El join de última visita
// (MAX checked_in_at) se repite en count y select porque Kysely infiere mejor
// inline. Devuelve { rows, total, truncated }: truncated=true si el universo
// superó el tope.
export async function loadUsersForExport(
  db: DbClient,
  orgId: string,
  params: UsersExportParams,
): Promise<{ rows: UserExportRow[]; total: number; truncated: boolean }> {
  const pattern = params.scope === 'view' && params.search ? likeContains(params.search) : undefined;
  const cohortCond = params.scope === 'view' ? cohortCondition(params.cohort) : null;
  const statusCond = statusCondition(params.status);

  let rowsQ = db.selectFrom('users')
    .leftJoin(
      (eb) => eb.selectFrom('attendance')
        .select(['attendance.user_id'])
        .select((e) => e.fn.max('attendance.checked_in_at').as('last_visit_at'))
        .where('attendance.organization_id', '=', orgId)
        .where('attendance.checked_in_at', 'is not', null)
        .groupBy('attendance.user_id')
        .as('lv'),
      (join) => join.onRef('lv.user_id', '=', 'users.id'),
    )
    .select([
      'users.code', 'users.first_name', 'users.last_name', 'users.email', 'users.phone',
      'users.visit_count', 'users.credential_sent_at', 'users.deleted_at', 'users.created_at',
      'lv.last_visit_at',
    ])
    .where('users.organization_id', '=', orgId);

  let countQ = db.selectFrom('users')
    .leftJoin(
      (eb) => eb.selectFrom('attendance')
        .select(['attendance.user_id'])
        .select((e) => e.fn.max('attendance.checked_in_at').as('last_visit_at'))
        .where('attendance.organization_id', '=', orgId)
        .where('attendance.checked_in_at', 'is not', null)
        .groupBy('attendance.user_id')
        .as('lv'),
      (join) => join.onRef('lv.user_id', '=', 'users.id'),
    )
    .select(db.fn.countAll<string>().as('n'))
    .where('users.organization_id', '=', orgId);

  if (pattern) {
    rowsQ = rowsQ.where((eb) => eb.or([
      eb('users.code', 'ilike', pattern),
      eb('users.first_name', 'ilike', pattern),
      eb('users.last_name', 'ilike', pattern),
      eb('users.email', 'ilike', pattern),
      eb('users.phone', 'ilike', pattern),
    ]));
    countQ = countQ.where((eb) => eb.or([
      eb('users.code', 'ilike', pattern),
      eb('users.first_name', 'ilike', pattern),
      eb('users.last_name', 'ilike', pattern),
      eb('users.email', 'ilike', pattern),
      eb('users.phone', 'ilike', pattern),
    ]));
  }
  if (cohortCond) { rowsQ = rowsQ.where(cohortCond); countQ = countQ.where(cohortCond); }
  if (statusCond) { rowsQ = rowsQ.where(statusCond); countQ = countQ.where(statusCond); }

  const [rows, countRow] = await Promise.all([
    rowsQ.orderBy('users.created_at', 'desc').orderBy('users.id', 'desc').limit(USERS_EXPORT_CAP).execute(),
    countQ.executeTakeFirstOrThrow(),
  ]);
  const total = Number(countRow.n);

  const toDate = (v: Date | string | null): Date | null => (v == null ? null : v instanceof Date ? v : new Date(v));
  const out: UserExportRow[] = rows.map((r) => ({
    code: r.code,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    visitCount: Number(r.visit_count),
    lastVisitAt: toDate(r.last_visit_at as Date | string | null),
    credentialSentAt: toDate(r.credential_sent_at as Date | string | null),
    archived: r.deleted_at != null,
    createdAt: toDate(r.created_at as Date | string)!,
  }));
  return { rows: out, total, truncated: total > out.length };
}

function rowCells(r: UserExportRow): (string | number)[] {
  return [
    r.code, r.firstName, r.lastName, r.email ?? '', r.phone ?? '',
    r.visitCount, fmt(r.lastVisitAt), r.credentialSentAt ? fmt(r.credentialSentAt) : 'No',
    r.archived ? 'Archivado' : 'Activo', fmt(r.createdAt),
  ];
}

export function buildUsersCsv(rows: UserExportRow[]): string {
  const lines = [csvRow(COLUMNS), ...rows.map((r) => csvRow(rowCells(r)))];
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

function hexToARGB(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const m = /^#?([a-f\d]{6})$/i.exec(hex);
  return m ? 'FF' + m[1]!.toUpperCase() : null;
}

export interface ExportOrg { name: string; primaryColor: string | null; secondaryColor: string | null; logoUrl: string | null }

// Workbook branded de una hoja "Visitantes": banda de marca + logo + header con
// el color primario del tenant, autofilter y fila congelada. Mismo lenguaje
// visual que los reportes.
export async function buildUsersWorkbook(rows: UserExportRow[], org: ExportOrg): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = org.name || 'contan2-saas';
  wb.created = new Date();

  const palette = generatePalette(org.primaryColor || '#1a237e') || {};
  const primaryArgb = hexToARGB(palette['700']) || hexToARGB(org.primaryColor) || 'FF1A237E';
  const accentArgb = hexToARGB(org.secondaryColor) || 'FFFF6F00';
  const onPrimaryArgb = pickOn(palette['700'] || org.primaryColor || '#1a237e') === '#ffffff' ? 'FFFFFFFF' : 'FF1F2937';

  const ws = wb.addWorksheet('Visitantes', {
    properties: { tabColor: { argb: primaryArgb } },
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
  });
  ws.columns = [
    { width: 16 }, { width: 20 }, { width: 20 }, { width: 30 }, { width: 16 },
    { width: 9 }, { width: 18 }, { width: 18 }, { width: 12 }, { width: 20 },
  ];

  // Banda de marca + logo.
  ws.mergeCells('A1:J1');
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  ws.getRow(1).height = 30;
  const title = ws.getCell('A1');
  title.value = `  ${org.name} · Padrón de visitantes`;
  title.font = { name: 'Calibri', size: 13, bold: true, color: { argb: onPrimaryArgb } };
  title.alignment = { vertical: 'middle' };
  const dataUri = await loadLogoDataUri(org.logoUrl);
  const lm = dataUri ? /^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/.exec(dataUri) : null;
  if (lm) {
    const ext = (lm[1] === 'jpg' ? 'jpeg' : lm[1]) as 'png' | 'jpeg' | 'gif';
    const imageId = wb.addImage({ buffer: Buffer.from(lm[2]!, 'base64') as unknown as ExcelJS.Buffer, extension: ext });
    ws.addImage(imageId, { tl: { col: 9.1, row: 0.1 }, ext: { width: 70, height: 28 } });
  }
  ws.getCell('A2').value = `Generado ${fmt(new Date())} · ${rows.length} visitante(s)`;
  ws.getCell('A2').font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF6B7280' } };
  ws.getRow(2).height = 16;

  // Header (fila 3).
  const header = ws.getRow(3);
  COLUMNS.forEach((c, i) => { header.getCell(i + 1).value = c; });
  header.font = { name: 'Calibri', size: 11, bold: true, color: { argb: onPrimaryArgb } };
  header.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  header.height = 24;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
    cell.border = { bottom: { style: 'medium', color: { argb: accentArgb } } };
  });

  for (const r of rows) {
    const dr = ws.addRow(rowCells(r));
    if (r.archived) dr.font = { color: { argb: 'FF9CA3AF' } };
  }
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLUMNS.length } };

  return Buffer.from(await wb.xlsx.writeBuffer()) as Buffer;
}
