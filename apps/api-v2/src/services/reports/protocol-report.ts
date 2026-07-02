// apps/api-v2/src/services/reports/protocol-report.ts · reporte FORMAL de
// protocolo por período (exportable a Excel, branded por tenant). Cubre la
// dimensión "por período" (rango de fechas) y "por actividad" (una hoja de
// desglose), que el reporte de período de asistencia no traía. Rendición de
// cuentas: a quién se invitó, de qué categoría, quién asistió, con cuántos
// acompañantes, en cada actividad del rango.

import ExcelJS from 'exceljs';
import type { DbClient } from '@contan2/db';

const PROTO_CAT: Record<string, string> = {
  autoridad: 'Autoridad', diplomatico: 'Diplomático', prensa: 'Prensa',
  patrocinador: 'Patrocinador', directivo: 'Directivo', artista: 'Artista', otro: 'Otro',
};
const STATUS_LABEL: Record<string, string> = {
  attended: 'Asistió', confirmed: 'Confirmó', pending: 'Invitado',
  declined: 'No puede', expired: 'Expiró',
};

export interface ProtocolReportOrg { name: string; primaryColor: string | null }

export interface ProtocolDetailRow {
  activityName: string; activityDate: string;
  name: string; honorific: string | null; category: string; institution: string | null;
  status: string; plusOnes: number; attended: boolean;
}
export interface ProtocolActivityRow {
  name: string; date: string; invited: number; confirmed: number; attended: number; partySize: number;
}
export interface ProtocolReportData {
  range: { from: string; to: string };
  summary: {
    invited: number; confirmed: number; attended: number; declined: number; pending: number;
    attendanceRate: number; totalPartySize: number; byCategory: Record<string, number>;
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
      'i.status', 'i.plus_ones', 'att.checked_in_at',
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
    attendanceRate: 0, totalPartySize: 0, byCategory: {} as Record<string, number>,
  };

  for (const r of rows) {
    const attended = r.checked_in_at != null;
    const category = (r.category ?? 'otro') as string;
    const plusOnes = Number(r.plus_ones ?? 0);
    const status = attended ? 'attended' : (r.status as string);
    const party = 1 + plusOnes;

    detail.push({
      activityName: r.activityName,
      activityDate: String(r.activityDate),
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || '—',
      honorific: r.honorific,
      category,
      institution: r.institution,
      status,
      plusOnes,
      attended,
    });

    // Resumen
    summary.invited += 1;
    summary.byCategory[category] = (summary.byCategory[category] ?? 0) + 1;
    if (attended) { summary.attended += 1; summary.totalPartySize += party; }
    else if (r.status === 'confirmed') { summary.confirmed += 1; summary.totalPartySize += party; }
    else if (r.status === 'pending') summary.pending += 1;
    else if (r.status === 'declined' || r.status === 'expired') summary.declined += 1;

    // Por actividad
    const key = `${r.activityName}__${String(r.activityDate)}`;
    let a = byActMap.get(key);
    if (!a) { a = { name: r.activityName, date: String(r.activityDate), invited: 0, confirmed: 0, attended: 0, partySize: 0 }; byActMap.set(key, a); }
    a.invited += 1;
    if (attended) { a.attended += 1; a.partySize += party; }
    else if (r.status === 'confirmed') { a.confirmed += 1; a.partySize += party; }
  }

  summary.attendanceRate = summary.invited > 0 ? Math.round((summary.attended / summary.invited) * 100) : 0;
  const byActivity = [...byActMap.values()].sort((x, y) => (x.date < y.date ? 1 : -1));

  return { range: { from, to }, summary, byActivity, detail };
}

// '#e65100' → 'FFE65100' (ARGB de ExcelJS). Fallback al naranja de marca.
function toArgb(hex: string | null): string {
  const h = (hex ?? '').replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(h) ? `FF${h.toUpperCase()}` : 'FFE65100';
}

// Construye una hoja con banda de título branded + fila de período + encabezado.
function styledSheet(wb: ExcelJS.Workbook, name: string, title: string, headers: string[], brand: string, range: { from: string; to: string }): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name);
  ws.mergeCells(1, 1, 1, Math.max(headers.length, 2));
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
  t.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, Math.max(headers.length, 2));
  const p = ws.getCell(2, 1);
  p.value = range.to ? `Período: ${range.from} a ${range.to}` : `Período: ${range.from}`;
  p.font = { italic: true, color: { argb: 'FF555555' } };
  if (headers.length > 0) {
    const head = ws.getRow(4);
    headers.forEach((h, i) => {
      const c = head.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
    });
    head.height = 20;
  }
  return ws;
}

export async function buildProtocolExcelReport(
  organization: ProtocolReportOrg,
  data: ProtocolReportData,
): Promise<ExcelJS.Workbook> {
  const brand = toArgb(organization.primaryColor);
  const wb = new ExcelJS.Workbook();
  wb.creator = organization.name;

  // -------- Hoja 1: Resumen --------
  const s1 = styledSheet(wb, 'Resumen', `${organization.name} · Protocolo`, [], brand, data.range);
  const kpis: Array<[string, number | string]> = [
    ['Invitados de protocolo', data.summary.invited],
    ['Confirmados', data.summary.confirmed],
    ['Asistieron', data.summary.attended],
    ['No pudieron', data.summary.declined],
    ['Pendientes', data.summary.pending],
    ['Tasa de asistencia', `${data.summary.attendanceRate}%`],
    ['Total personas (con acompañantes)', data.summary.totalPartySize],
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
  s1.getColumn(1).width = 34;
  s1.getColumn(2).width = 16;

  // -------- Hoja 2: Por actividad --------
  const H2 = ['Actividad', 'Fecha', 'Invitados', 'Confirmados', 'Asistieron', 'Personas'];
  const s2 = styledSheet(wb, 'Por actividad', `${organization.name} · Protocolo por actividad`, H2, brand, data.range);
  for (const a of data.byActivity) {
    s2.addRow([a.name, a.date.slice(0, 10), a.invited, a.confirmed, a.attended, a.partySize]);
  }
  s2.getColumn(1).width = 40; s2.getColumn(2).width = 14;
  [3, 4, 5, 6].forEach((c) => (s2.getColumn(c).width = 13));

  // -------- Hoja 3: Detalle --------
  const H3 = ['Actividad', 'Fecha', 'Invitado', 'Honorífico', 'Categoría', 'Institución', 'Estado', 'Acompañantes', 'Asistió'];
  const s3 = styledSheet(wb, 'Detalle', `${organization.name} · Detalle de invitados`, H3, brand, data.range);
  for (const d of data.detail) {
    s3.addRow([
      d.activityName, d.activityDate.slice(0, 10), d.name, d.honorific ?? '',
      PROTO_CAT[d.category] ?? d.category, d.institution ?? '',
      STATUS_LABEL[d.status] ?? d.status,
      d.plusOnes > 0 ? `+${d.plusOnes}` : '—',
      d.attended ? 'Sí' : 'No',
    ]);
  }
  s3.getColumn(1).width = 36; s3.getColumn(3).width = 24; s3.getColumn(6).width = 26;
  [2, 4, 5, 7, 8, 9].forEach((c) => (s3.getColumn(c).width = 14));

  return wb;
}

export function protocolReportFilename(from: string, to: string): string {
  return `protocolo_${from}_a_${to}.xlsx`.replace(/[^a-zA-Z0-9_.-]/g, '');
}
