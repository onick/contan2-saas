// apps/api-v2/src/services/reports/protocol-report.ts · reporte FORMAL de
// protocolo por período (exportable a Excel, branded por tenant). Cubre la
// dimensión "por período" (rango de fechas) y "por actividad" (una hoja de
// desglose), que el reporte de período de asistencia no traía. Rendición de
// cuentas: a quién se invitó, de qué categoría, quién asistió, con cuántos
// acompañantes, en cada actividad del rango.

import ExcelJS from 'exceljs';
import type { DbClient } from '@contan2/db';
import { textArgb } from '../branding-tokens.js';
import { toArgb, brandTitleBand, brandHeaderRow, subtitleRow, setColumnWidths, EXCEL_DATE_FMT } from './excel-kit.js';
import { excelDateCell } from './fmt.js';
import { peopleOf } from './metrics.js';
import { PROTOCOL_CATEGORY_LABELS } from './labels.js';

// Instante de actividad como ISO (UTC): ordenable por cadena y sin depender de String(Date).
const isoDate = (v: unknown): string => (v instanceof Date ? v : new Date(v as string)).toISOString();

const PROTO_CAT = PROTOCOL_CATEGORY_LABELS;
const STATUS_LABEL: Record<string, string> = {
  attended: 'Asistió', confirmed: 'Confirmó', pending: 'Invitado',
  declined: 'No puede', expired: 'Expiró',
};

export interface ProtocolReportOrg { name: string; primaryColor: string | null }

export interface ProtocolDetailRow {
  activityName: string; activityDate: string;
  name: string; honorific: string | null; category: string; institution: string | null;
  status: string;
  /** Acompañantes DECLARADOS en la invitación (plus_ones). */
  plusOnes: number;
  attended: boolean;
  /** Acompañantes REALES del check-in (children + adults); 0 si no asistió. */
  companions: number;
  /** Personas: asistió => 1 + acompañantes reales; confirmado sin llegar => 1 + declarados; si no 0. */
  people: number;
}
export interface ProtocolActivityRow {
  name: string; date: string; invited: number;
  /** Confirmados, INCLUYENDO a quienes ya asistieron. */
  confirmed: number; attended: number;
  /** Personas que asistieron (1 + acompañantes reales, misma definición que period-engine). */
  people: number;
  /** Personas esperadas aún: confirmados sin llegar (1 + acompañantes declarados). */
  expectedPeople: number;
}
export interface ProtocolReportData {
  range: { from: string; to: string };
  summary: {
    invited: number;
    /** Confirmados, INCLUYENDO a quienes ya asistieron. */
    confirmed: number; attended: number; declined: number; pending: number;
    attendanceRate: number;
    /** Personas que asistieron (1 + acompañantes reales). */
    attendedPeople: number;
    /** Personas esperadas aún (confirmados sin llegar, con acompañantes declarados). */
    expectedPeople: number;
    /** attendedPeople + expectedPeople. */
    totalPartySize: number;
    byCategory: Record<string, number>;
  };
  byActivity: ProtocolActivityRow[];
  detail: ProtocolDetailRow[];
}

// Carga las invitaciones de protocolo (no canceladas) de las actividades cuyo
// `date` cae en [from, to], con identidad + perfil + asistencia derivada.
export async function loadProtocolReportData(
  db: DbClient,
  orgId: string,
  from: string,
  to: string,
): Promise<ProtocolReportData> {
  const rows = await db.selectFrom('invitations as i')
    .innerJoin('activities as a', 'a.id', 'i.activity_id')
    .innerJoin('users as u', 'u.id', 'i.user_id')
    .leftJoin('protocol_profiles as p', (join) =>
      join.onRef('p.user_id', '=', 'i.user_id').on('p.organization_id', '=', orgId))
    .leftJoin('attendance as att', (join) =>
      join.onRef('att.activity_id', '=', 'i.activity_id').onRef('att.user_id', '=', 'i.user_id'))
    .select([
      'a.name as activityName', 'a.date as activityDate',
      'u.first_name', 'u.last_name',
      'p.honorific', 'p.category', 'p.org_title as institution',
      'i.status', 'i.plus_ones', 'att.checked_in_at', 'att.companions_children', 'att.companions_adults',
    ])
    .where('i.organization_id', '=', orgId)
    .where('i.kind', '=', 'protocol')
    .where('i.status', '!=', 'canceled')
    .where('a.date', '>=', new Date(from))
    .where('a.date', '<', new Date(to)) // `to` viene exclusivo (parsePeriodQuery suma 1 día)
    .orderBy('a.date', 'desc')
    .execute();

  const detail: ProtocolDetailRow[] = [];
  const byActMap = new Map<string, ProtocolActivityRow>();
  const summary = {
    invited: 0, confirmed: 0, attended: 0, declined: 0, pending: 0,
    attendanceRate: 0, attendedPeople: 0, expectedPeople: 0, totalPartySize: 0, byCategory: {} as Record<string, number>,
  };

  for (const r of rows) {
    const attended = r.checked_in_at != null;
    const category = (r.category ?? 'otro') as string;
    const plusOnes = Number(r.plus_ones ?? 0);
    const status = attended ? 'attended' : (r.status as string);
    // Personas REALES (misma definición que period-engine): 1 + acompañantes del check-in.
    const real = attended
      ? peopleOf({ companionsChildren: r.companions_children, companionsAdults: r.companions_adults })
      : 0;
    const companions = attended ? real - 1 : 0;
    const expected = !attended && r.status === 'confirmed' ? 1 + plusOnes : 0;

    detail.push({
      activityName: r.activityName,
      activityDate: isoDate(r.activityDate),
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || '—',
      honorific: r.honorific,
      category,
      institution: r.institution,
      status,
      plusOnes,
      attended,
      companions,
      people: attended ? real : expected,
    });

    // Resumen
    summary.invited += 1;
    summary.byCategory[category] = (summary.byCategory[category] ?? 0) + 1;
    if (attended) { summary.attended += 1; summary.confirmed += 1; summary.attendedPeople += real; }
    else if (r.status === 'confirmed') { summary.confirmed += 1; summary.expectedPeople += expected; }
    else if (r.status === 'pending') summary.pending += 1;
    else if (r.status === 'declined' || r.status === 'expired') summary.declined += 1;

    // Por actividad
    const key = `${r.activityName}__${isoDate(r.activityDate)}`;
    let a = byActMap.get(key);
    if (!a) { a = { name: r.activityName, date: isoDate(r.activityDate), invited: 0, confirmed: 0, attended: 0, people: 0, expectedPeople: 0 }; byActMap.set(key, a); }
    a.invited += 1;
    if (attended) { a.attended += 1; a.confirmed += 1; a.people += real; }
    else if (r.status === 'confirmed') { a.confirmed += 1; a.expectedPeople += expected; }
  }

  summary.totalPartySize = summary.attendedPeople + summary.expectedPeople;
  summary.attendanceRate = summary.invited > 0 ? Math.round((summary.attended / summary.invited) * 100) : 0;
  const byActivity = [...byActMap.values()].sort((x, y) => (x.date < y.date ? 1 : -1));

  return { range: { from, to }, summary, byActivity, detail };
}

// Construye una hoja con banda de título branded + fila de período + encabezado.
function styledSheet(wb: ExcelJS.Workbook, name: string, title: string, headers: string[], brand: string, brandText: string, range: { from: string; to: string }): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name);
  const ncols = Math.max(headers.length, 2);
  const pal = { brand, brandText };
  brandTitleBand(ws, title, ncols, pal, 'left');
  subtitleRow(ws, 2, ncols, range.to ? `Período: ${range.from} a ${range.to}` : `Período: ${range.from}`);
  if (headers.length > 0) brandHeaderRow(ws, 4, headers, pal, { height: 20 });
  return ws;
}

export async function buildProtocolExcelReport(
  organization: ProtocolReportOrg,
  data: ProtocolReportData,
): Promise<ExcelJS.Workbook> {
  const brand = toArgb(organization.primaryColor);
  const brandText = textArgb(organization.primaryColor ?? '#f39228');
  const wb = new ExcelJS.Workbook();
  wb.creator = organization.name;

  // -------- Hoja 1: Resumen --------
  const s1 = styledSheet(wb, 'Resumen', `${organization.name} · Protocolo`, [], brand, brandText, data.range);
  const kpis: Array<[string, number | string]> = [
    ['Invitados de protocolo', data.summary.invited],
    ['Confirmados (incluye asistentes)', data.summary.confirmed],
    ['Asistieron', data.summary.attended],
    ['No pudieron', data.summary.declined],
    ['Pendientes', data.summary.pending],
    ['Tasa de asistencia', `${data.summary.attendanceRate}%`],
    ['Personas que asistieron (con acompañantes reales)', data.summary.attendedPeople],
    ['Personas esperadas (confirmados que aún no llegan, con acompañantes declarados)', data.summary.expectedPeople],
    ['Total de personas (asistieron + esperadas)', data.summary.totalPartySize],
  ];
  let row = 4;
  for (const [k, v] of kpis) {
    s1.getCell(row, 1).value = k;
    s1.getCell(row, 1).font = { bold: true };
    s1.getCell(row, 2).value = v;
    row += 1;
  }
  row += 1;
  s1.getCell(row, 1).value = 'Por categoría';
  s1.getCell(row, 1).font = { bold: true, color: { argb: brand } };
  row += 1;
  for (const cat of Object.keys(PROTO_CAT)) {
    const n = data.summary.byCategory[cat] ?? 0;
    if (n === 0) continue;
    s1.getCell(row, 1).value = PROTO_CAT[cat];
    s1.getCell(row, 2).value = n;
    row += 1;
  }
  s1.getColumn(1).width = 62;
  s1.getColumn(2).width = 16;

  // -------- Hoja 2: Por actividad --------
  const H2 = ['Actividad', 'Fecha', 'Invitados', 'Confirmados (incluye asistentes)', 'Asistieron', 'Personas que asistieron', 'Personas esperadas'];
  const s2 = styledSheet(wb, 'Por actividad', `${organization.name} · Protocolo por actividad`, H2, brand, brandText, data.range);
  for (const a of data.byActivity) {
    const r2 = s2.addRow([a.name, excelDateCell(a.date), a.invited, a.confirmed, a.attended, a.people, a.expectedPeople]);
    r2.getCell(2).numFmt = EXCEL_DATE_FMT;
  }
  s2.getColumn(1).width = 40; s2.getColumn(2).width = 14;
  [3, 4, 5, 6, 7].forEach((c) => (s2.getColumn(c).width = 16));

  // -------- Hoja 3: Detalle --------
  const H3 = ['Actividad', 'Fecha', 'Invitado', 'Honorífico', 'Categoría', 'Institución', 'Estado', 'Acompañantes declarados', 'Acompañantes reales', 'Personas', 'Asistió'];
  const s3 = styledSheet(wb, 'Detalle', `${organization.name} · Detalle de invitados`, H3, brand, brandText, data.range);
  for (const d of data.detail) {
    const r3 = s3.addRow([
      d.activityName, excelDateCell(d.activityDate), d.name, d.honorific ?? '',
      PROTO_CAT[d.category] ?? d.category, d.institution ?? '',
      STATUS_LABEL[d.status] ?? d.status,
      d.plusOnes > 0 ? `+${d.plusOnes}` : '—',
      d.attended ? (d.companions > 0 ? `+${d.companions}` : '0') : '—',
      d.people,
      d.attended ? 'Sí' : 'No',
    ]);
    r3.getCell(2).numFmt = EXCEL_DATE_FMT;
  }
  s3.getColumn(1).width = 36; s3.getColumn(3).width = 24; s3.getColumn(6).width = 26;
  [2, 4, 5, 7, 8, 9, 10, 11].forEach((c) => (s3.getColumn(c).width = 15));

  return wb;
}

export function protocolReportFilename(from: string, to: string): string {
  return `protocolo_${from}_a_${to}.xlsx`.replace(/[^a-zA-Z0-9_.-]/g, '');
}
