// apps/api-v2/src/services/reports/monthly-register-excel.ts · genera el .xlsx
// del "registro mensual" en el formato del departamento: las 8 columnas
// idénticas a su plantilla (No. · Fecha · Mes · Semana · Tipo de actividad ·
// Programa · Nombre Actividad/Observación · Asistencia), fila Total; hoja
// "Resumen Mensual" (pivote por Tipo y por Programa) y hoja oculta "Listas" que
// alimenta los dropdowns de Tipo y Programa. Branded por tenant.
//
// Anti-injection: ExcelJS escribe strings como texto (ValueType String), nunca
// como fórmula — un valor que empieza con '=' queda como texto y no se ejecuta.

import ExcelJS from 'exceljs';
import { TIPO_ORDER, type MonthlyRegisterReport } from './monthly-register.js';
import { textArgb } from '../branding-tokens.js';

export interface ReportBranding { name: string; primaryColor: string }

// '#f39228' → 'FFF39228' (ARGB de ExcelJS). Fallback al naranja de marca CCB.
function toArgb(hex: string): string {
  const h = (hex ?? '').replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(h) ? `FF${h.toUpperCase()}` : 'FFF39228';
}

const HEADERS = [
  'No.', 'Fecha', 'Mes', 'Semana', 'Tipo de actividad', 'Programa',
  'Nombre Actividad / Observación', 'Asistencia',
];
const NCOLS = HEADERS.length; // 8
const SIN_PROGRAMA = '(Sin programa)';

export async function buildMonthlyRegisterWorkbook(
  report: MonthlyRegisterReport,
  branding: ReportBranding,
): Promise<Buffer> {
  const brand = toArgb(branding.primaryColor);
  const brandText = textArgb(branding.primaryColor);
  const wb = new ExcelJS.Workbook();
  wb.creator = branding.name;
  const ws = wb.addWorksheet(`${report.monthName} ${report.year}`);

  const band = (cell: ExcelJS.Cell) => {
    cell.font = { bold: true, color: { argb: brandText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
    cell.alignment = { vertical: 'middle' };
  };

  // Título branded.
  ws.mergeCells(1, 1, 1, NCOLS);
  const title = ws.getCell(1, 1);
  title.value = `REGISTRO ACTIVIDADES ${report.monthName.toUpperCase()} ${report.year}`;
  title.font = { bold: true, size: 14, color: { argb: brandText } };
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

  // ── Hoja oculta "Listas" ────────────────────────────────────────────────────
  // Valores válidos que alimentan los dropdowns (validación de datos) de las
  // columnas Tipo y Programa de la hoja del mes. Tipo: las 5 etiquetas del
  // departamento; Programa: los programas presentes en el mes.
  const programasLista = report.porPrograma.map((p) => p.label).filter((l) => l !== SIN_PROGRAMA);
  const tipoRef = `Listas!$A$2:$A$${TIPO_ORDER.length + 1}`;
  const progRef = `Listas!$B$2:$B$${programasLista.length + 1}`;

  // Dropdowns en las filas de datos (Tipo estricto; Programa permite texto
  // libre con aviso, porque las categorías de la actividad son abiertas).
  const firstDataRow = 3;
  const lastDataRow = firstDataRow + report.rows.length - 1;
  for (let r = firstDataRow; r <= lastDataRow; r++) {
    ws.getCell(r, 5).dataValidation = {
      type: 'list', allowBlank: true, formulae: [tipoRef],
      showErrorMessage: true, errorStyle: 'stop',
      errorTitle: 'Tipo no válido', error: 'Elige un tipo de la lista.',
    };
    if (programasLista.length > 0) {
      ws.getCell(r, 6).dataValidation = {
        type: 'list', allowBlank: true, formulae: [progRef],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Programa fuera de la lista', error: 'Este programa no está en la lista. ¿Quieres usarlo igual?',
      };
    }
  }

  // ── Hoja "Resumen Mensual": pivote por Tipo (+ por Programa) ───────────────
  const rs = wb.addWorksheet('Resumen Mensual');
  rs.mergeCells(1, 1, 1, 3);
  const rt = rs.getCell(1, 1);
  rt.value = `RESUMEN MENSUAL ${report.monthName.toUpperCase()} ${report.year}`;
  rt.font = { bold: true, size: 14, color: { argb: brandText } };
  rt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
  rt.alignment = { vertical: 'middle', horizontal: 'center' };
  rs.getRow(1).height = 26;

  const pivot = (title: string, rows: { label: string; actividades: number; asistencia: number }[], totalLabel: string) => {
    const h = rs.addRow([title, 'Actividades', 'Asistencia total']);
    h.eachCell((c) => band(c));
    for (const t of rows) rs.addRow([t.label, t.actividades, t.asistencia]);
    const tot = rs.addRow([
      totalLabel,
      rows.reduce((n, t) => n + t.actividades, 0),
      rows.reduce((n, t) => n + t.asistencia, 0),
    ]);
    tot.eachCell((c) => { c.font = { bold: true }; c.border = { top: { style: 'thin' } }; });
    for (const col of [2, 3]) {
      for (let r = h.number + 1; r <= tot.number; r++) rs.getCell(r, col).alignment = { horizontal: 'center' };
    }
  };
  pivot('Tipo de actividad', report.porTipo, 'Total general');
  rs.addRow([]);
  pivot('Programa', report.porPrograma, 'Total general');
  rs.getColumn(1).width = 34; rs.getColumn(2).width = 14; rs.getColumn(3).width = 18;

  const listas = wb.addWorksheet('Listas', { state: 'hidden' });
  listas.getCell(1, 1).value = 'Tipo de actividad';
  listas.getCell(1, 2).value = 'Programa';
  TIPO_ORDER.forEach((t, i) => { listas.getCell(i + 2, 1).value = t; });
  programasLista.forEach((p, i) => { listas.getCell(i + 2, 2).value = p; });

  // Anchos legibles (No, Fecha, Mes, Semana, Tipo, Programa, Nombre, Asistencia).
  const widths = [6, 13, 12, 9, 20, 26, 46, 12];
  ws.columns.forEach((col, i) => { col.width = widths[i] ?? 14; });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
