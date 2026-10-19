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

  ws.columns.forEach((col, i) => {
    col.width = i === 3 || i === 6 ? 28 : i === 0 || i === 8 ? 22 : 13;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
