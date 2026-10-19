// apps/api-v2/src/services/puerta-export.ts · genera el .xlsx de "datos de la
// puerta" (asistencia de las salas permanentes) con ExcelJS, branded por tenant.
// Lo consume el departamento de Puerta para descargar la actividad de SUS salas
// (Ada Balcácer + Sala VR, o una sola). Cada fila = una entrada registrada
// (cada entrada cuenta; sin dedup). Memoria acotada por la cota de filas del
// route. Anti-injection: strings escritos como texto (nunca fórmulas).

import ExcelJS from 'exceljs';
import { textArgb } from './branding-tokens.js';
import { toArgb, brandTitleBand, brandHeaderRow, subtitleRow } from './reports/excel-kit.js';

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

/** Cota dura de filas del export (memoria acotada). `PUERTA_EXPORT_ROW_CAP` la ajusta (tests). */
export function puertaExportRowCap(): number {
  const n = Number(process.env.PUERTA_EXPORT_ROW_CAP);
  return Number.isInteger(n) && n > 0 ? n : 50_000;
}

/** Aviso de truncado: filas del universo (`total`) y las que el archivo incluye (`shown`). */
export interface PuertaExportTruncation { total: number; shown: number }

/** "… 1.200 filas más no incluidas" · texto de la fila final y del subtítulo (REP-A25). */
export function puertaTruncationNote(t: PuertaExportTruncation): string {
  const missing = Math.max(0, t.total - t.shown);
  return `… ${missing.toLocaleString('es-DO')} ${missing === 1 ? 'fila más no incluida' : 'filas más no incluidas'}`
    + ` (el archivo trae las primeras ${t.shown.toLocaleString('es-DO')} de ${t.total.toLocaleString('es-DO')}). Acota el rango de fechas para ver el resto.`;
}

export interface PuertaExportMeta {
  /** Presente solo si el export cortó filas por la cota. */
  truncated?: PuertaExportTruncation;
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

export async function buildPuertaExportWorkbook(
  rows: PuertaExportRow[],
  meta: PuertaExportMeta,
): Promise<Buffer> {
  const brand = toArgb(meta.primaryColor);
  const brandText = textArgb(meta.primaryColor ?? '#f39228');
  const fmtDate = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: meta.tz });
  const fmtTime = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: meta.tz });

  const wb = new ExcelJS.Workbook();
  wb.creator = meta.orgName;
  const ws = wb.addWorksheet('Puerta');

  // Título branded, rango + total y encabezado de columnas (fila 4).
  const pal = { brand, brandText };
  brandTitleBand(ws, `${meta.orgName} · Datos de la puerta — ${meta.salaLabel}`, HEADERS.length, pal, 'left');
  const totalPeople = rows.reduce((n, r) => n + r.partySize, 0);
  subtitleRow(ws, 2, HEADERS.length, `Período: ${meta.rangeLabel} · ${rows.length} registros · ${totalPeople} personas`);
  if (meta.truncated) {
    // Aviso visible arriba (fila 3): quien abre el archivo ve que NO es el universo completo.
    const warn = subtitleRow(ws, 3, HEADERS.length, `AVISO: ${puertaTruncationNote(meta.truncated)}`);
    warn.font = { bold: true, color: { argb: 'FFB45309' } };
  }
  brandHeaderRow(ws, 4, HEADERS, pal, { height: 20, alignment: { vertical: 'middle' } });

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

  // Fila final del aviso de truncado (REP-A25): el archivo nunca corta en silencio.
  if (meta.truncated) {
    const noteRow = ws.addRow([puertaTruncationNote(meta.truncated)]);
    noteRow.getCell(1).font = { bold: true, italic: true, color: { argb: 'FFB45309' } };
  }

  ws.columns.forEach((col, i) => {
    col.width = i === 3 || i === 6 ? 28 : i === 0 || i === 8 ? 22 : 13;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
