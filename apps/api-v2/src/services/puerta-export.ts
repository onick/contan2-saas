// apps/api-v2/src/services/puerta-export.ts · genera el .xlsx de "datos de la
// puerta" (asistencia de las salas permanentes) con ExcelJS, branded por tenant.
// Lo consume el departamento de Puerta para descargar la actividad de SUS salas
// (Ada Balcácer + Sala VR, o una sola). Cada fila = una entrada registrada
// (cada entrada cuenta; sin dedup). Memoria acotada por la cota de filas del
// route. Anti-injection: strings escritos como texto (nunca fórmulas).

import ExcelJS from 'exceljs';

export interface PuertaExportRow {
  salaName: string;
  registeredAt: string; // ISO
  anonymous: boolean;
  visitorName: string | null; // "Nombre Apellido" si identificado
  code: string | null;
  groupLabel: string | null;
  groupKind: string | null; // null + groupLabel presente ⇒ colegio (histórico)
  groupLevel: string | null;
  groupContact: string | null;
  companions: number; // children + adults
  partySize: number; // 1 + companions
}

export interface PuertaExportMeta {
  orgName: string;
  primaryColor: string | null;
  salaLabel: string; // "Todas las salas" | "Sala VR" | …
  rangeLabel: string; // "Todo el histórico" | "2026-07-01 a 2026-07-31"
  tz: string;
}

const HEADERS = [
  'Sala', 'Fecha', 'Hora', 'Visitante', 'Código',
  'Tipo de grupo', 'Grupo', 'Nivel', 'Responsable', 'Acompañantes', 'Personas',
];

// '#e65100' → 'FFE65100' (ARGB de ExcelJS). Fallback al naranja de marca.
function toArgb(hex: string | null): string {
  const h = (hex ?? '').replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(h) ? `FF${h.toUpperCase()}` : 'FFE65100';
}

export async function buildPuertaExportWorkbook(
  rows: PuertaExportRow[],
  meta: PuertaExportMeta,
): Promise<Buffer> {
  const brand = toArgb(meta.primaryColor);
  const fmtDate = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: meta.tz });
  const fmtTime = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: meta.tz });

  const wb = new ExcelJS.Workbook();
  wb.creator = meta.orgName;
  const ws = wb.addWorksheet('Puerta');

  // Título branded.
  ws.mergeCells(1, 1, 1, HEADERS.length);
  const title = ws.getCell(1, 1);
  title.value = `${meta.orgName} · Datos de la puerta — ${meta.salaLabel}`;
  title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
  title.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 26;

  // Rango + total.
  ws.mergeCells(2, 1, 2, HEADERS.length);
  const sub = ws.getCell(2, 1);
  const totalPeople = rows.reduce((n, r) => n + r.partySize, 0);
  sub.value = `Período: ${meta.rangeLabel} · ${rows.length} registros · ${totalPeople} personas`;
  sub.font = { italic: true, color: { argb: 'FF555555' } };

  // Encabezado de columnas (fila 4).
  const head = ws.getRow(4);
  HEADERS.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
    c.alignment = { vertical: 'middle' };
  });
  head.height = 20;

  for (const r of rows) {
    const d = new Date(r.registeredAt);
    // Nombre del visitante: identificado → nombre; grupo → colegio/grupo; si no → Anónimo.
    const visitor = r.visitorName?.trim() || r.groupLabel?.trim() || 'Anónimo';
    // Tipo de grupo: null con grupo presente = colegio (semántica histórica).
    const tipo = r.groupLabel ? (r.groupKind?.trim() || 'Colegio') : '';
    ws.addRow([
      r.salaName,
      fmtDate.format(d),
      fmtTime.format(d),
      visitor,
      r.code ?? '',
      tipo,
      r.groupLabel ?? '',
      r.groupLevel ?? '',
      r.groupContact ?? '',
      r.companions,
      r.partySize,
    ]);
  }

  // Total.
  const total = ws.addRow(['TOTAL', '', '', '', '', '', '', '', '', '', totalPeople]);
  total.font = { bold: true };

  ws.columns.forEach((col, i) => {
    col.width = i === 3 || i === 6 ? 28 : i === 0 || i === 8 ? 22 : 13;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
