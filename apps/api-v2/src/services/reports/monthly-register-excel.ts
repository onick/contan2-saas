// apps/api-v2/src/services/reports/monthly-register-excel.ts · genera el .xlsx
// del "registro mensual" en el formato del departamento: las 8 columnas
// idénticas a su plantilla (No. · Fecha · Mes · Semana · Tipo de actividad ·
// Programa · Nombre Actividad/Observación · Asistencia), fila Total y un bloque
// "Resumen del mes" (por Tipo y por Programa). Branded por tenant.
//
// Anti-injection: ExcelJS escribe strings como texto (ValueType String), nunca
// como fórmula — un valor que empieza con '=' queda como texto y no se ejecuta.

import ExcelJS from 'exceljs';
import type { MonthlyRegisterReport } from './monthly-register.js';

export interface ReportBranding { name: string; primaryColor: string }

// '#e65100' → 'FFE65100' (ARGB de ExcelJS). Fallback al naranja de marca.
function toArgb(hex: string): string {
  const h = (hex ?? '').replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(h) ? `FF${h.toUpperCase()}` : 'FFE65100';
}

const HEADERS = [
  'No.', 'Fecha', 'Mes', 'Semana', 'Tipo de actividad', 'Programa',
  'Nombre Actividad / Observación', 'Asistencia',
];
const NCOLS = HEADERS.length; // 8

export async function buildMonthlyRegisterWorkbook(
  report: MonthlyRegisterReport,
  branding: ReportBranding,
): Promise<Buffer> {
  const brand = toArgb(branding.primaryColor);
  const white = 'FFFFFFFF';
  const wb = new ExcelJS.Workbook();
  wb.creator = branding.name;
  const ws = wb.addWorksheet(`${report.monthName} ${report.year}`);

  const band = (cell: ExcelJS.Cell) => {
    cell.font = { bold: true, color: { argb: white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
    cell.alignment = { vertical: 'middle' };
  };

  // Título branded.
  ws.mergeCells(1, 1, 1, NCOLS);
  const title = ws.getCell(1, 1);
  title.value = `REGISTRO ACTIVIDADES ${report.monthName.toUpperCase()} ${report.year}`;
  title.font = { bold: true, size: 14, color: { argb: white } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;

  // Encabezado de columnas (fila 2, como su plantilla).
  const head = ws.getRow(2);
  HEADERS.forEach((h, i) => { const c = head.getCell(i + 1); c.value = h; band(c); });
  head.height = 20;

  // Filas de datos. La fecha va como celda Date real (numFmt dd/mm/yyyy).
  for (const r of report.rows) {
    const row = ws.addRow([
      r.no, new Date(r.date), report.monthName, r.semana, r.tipo, r.programa, r.nombre, r.asistencia,
    ]);
    row.getCell(2).numFmt = 'dd/mm/yyyy';
    row.getCell(2).alignment = { horizontal: 'center' };
    for (const col of [1, 4, 8]) row.getCell(col).alignment = { horizontal: 'center' };
  }

  // Fila Total (asistencia del mes).
  const total = ws.addRow(['', '', '', '', '', '', 'Total:', report.totalAsistencia]);
  total.getCell(7).font = { bold: true };
  total.getCell(7).alignment = { horizontal: 'right' };
  total.getCell(8).font = { bold: true };
  total.getCell(8).alignment = { horizontal: 'center' };

  // ── Bloque "Resumen del mes" ────────────────────────────────────────────────
  ws.addRow([]);
  const resTitleRow = ws.addRow(['Resumen del mes']);
  ws.mergeCells(resTitleRow.number, 1, resTitleRow.number, NCOLS);
  band(resTitleRow.getCell(1));

  const miniHead = (a: string, b: string, c: string) => {
    const row = ws.addRow([a, '', b, c]);
    for (const col of [1, 3, 4]) { row.getCell(col).font = { bold: true }; }
    row.getCell(1).alignment = { horizontal: 'left' };
    return row;
  };

  // Por Tipo.
  miniHead('Por tipo', 'Actividades', 'Asistencia');
  for (const t of report.porTipo) ws.addRow([t.label, '', t.actividades, t.asistencia]);
  ws.addRow([]);
  // Por Programa.
  miniHead('Por programa', 'Actividades', 'Asistencia');
  for (const p of report.porPrograma) ws.addRow([p.label, '', p.actividades, p.asistencia]);

  // Anchos legibles (No, Fecha, Mes, Semana, Tipo, Programa, Nombre, Asistencia).
  const widths = [6, 13, 12, 9, 20, 26, 46, 12];
  ws.columns.forEach((col, i) => { col.width = widths[i] ?? 14; });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
