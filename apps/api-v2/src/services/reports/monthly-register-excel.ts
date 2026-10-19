// apps/api-v2/src/services/reports/monthly-register-excel.ts · genera el .xlsx
// "Registro_Actividades_Culturales" en el formato del departamento (decisión
// P5). UN constructor para el libro anual (12 hojas Ene–Dic) y el registro
// mensual (1 hoja del libro): cada hoja trae las 8 columnas idénticas a su
// plantilla (No. · Fecha · Mes · Semana · Tipo de actividad · Programa ·
// Nombre Actividad/Observación · Asistencia), autoFilter y fila "Total:" con
// =SUM. La hoja "Resumen Mensual" es el pivote meses × tipos con fórmulas
// (SUMIFS contra cada hoja de mes) y TOTAL ANUAL. La hoja oculta "Listas"
// (Tipo · Programa · Mes · Semana) alimenta los dropdowns (validación de datos)
// de las columnas C/D/E/F. Branded por tenant.
//
// Cada fórmula lleva su resultado en caché, para que visores y lectores que no
// recalculan (vista previa, exceljs) muestren la cifra correcta.
//
// Anti-injection: ExcelJS escribe strings como texto (ValueType String), nunca
// como fórmula — un valor que empieza con '=' queda como texto y no se ejecuta.

import ExcelJS from 'exceljs';
import type { MonthlyRegisterReport, RegisterBook } from './monthly-register.js';
import { TIPO_ORDER, MESES_ES, MESES_CORTO, SEMANAS } from './labels.js';
import {
  excelDateCell, toArgb, brandHeaderCell, brandHeaderRow, brandTitleBand, setColumnWidths,
  applyAutoFilter, addSumTotalRow, addListsSheet, listValidation, EXCEL_DATE_FMT,
  type BrandPalette,
} from './excel-kit.js';
import { textArgb } from '../branding-tokens.js';

export interface ReportBranding { name: string; primaryColor: string }

const HEADERS = [
  'No.', 'Fecha', 'Mes', 'Semana', 'Tipo de actividad', 'Programa',
  'Nombre Actividad / Observación', 'Asistencia',
];
const NCOLS = HEADERS.length; // 8
const FIRST_DATA_ROW = 3; // fila 1 = título, fila 2 = encabezado
const WIDTHS = [6, 13, 12, 9, 22, 28, 46, 12];

/** Nombre de archivo: `Registro_Actividades_Culturales_2026.xlsx` / `…_2026_06.xlsx`. */
export function registerFilename(year: number, month?: number): string {
  const mm = month === undefined ? '' : `_${String(month).padStart(2, '0')}`;
  return `Registro_Actividades_Culturales_${year}${mm}.xlsx`;
}

/** Hoja de un mes (nombre corto Ene…Dic). */
const sheetName = (m: number): string => MESES_CORTO[m - 1] ?? `M${m}`;

type Palette = BrandPalette;

const MONTH_ALIGN = { vertical: 'middle', horizontal: 'center', wrapText: true } as const;
const band = (cell: ExcelJS.Cell, p: Palette): void => brandHeaderCell(cell, p, MONTH_ALIGN);

const titleRow = (ws: ExcelJS.Worksheet, text: string, ncols: number, p: Palette): void => {
  brandTitleBand(ws, text, ncols, p, 'center');
};

// Rangos de las listas ocultas (fila 1 = encabezado).
interface ListRefs { mes: string; semana: string; tipo: string; programa: string }
function listRefs(programasCount: number): ListRefs {
  return {
    tipo: `Listas!$A$2:$A$${TIPO_ORDER.length + 1}`,
    programa: `Listas!$B$2:$B$${Math.max(programasCount, 1) + 1}`,
    mes: `Listas!$C$2:$C$${MESES_ES.length + 1}`,
    semana: `Listas!$D$2:$D$${SEMANAS.length + 1}`,
  };
}

/** Última fila de datos de una hoja de mes (si no hay filas, la del encabezado). */
const lastDataRow = (r: MonthlyRegisterReport): number => Math.max(FIRST_DATA_ROW + r.rows.length - 1, FIRST_DATA_ROW - 1);

function buildMonthSheet(
  wb: ExcelJS.Workbook,
  report: MonthlyRegisterReport,
  refs: ListRefs,
  p: Palette,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(sheetName(report.month));
  titleRow(ws, `REGISTRO ACTIVIDADES ${report.monthName.toUpperCase()} ${report.year}`, NCOLS, p);

  brandHeaderRow(ws, 2, HEADERS, p, { height: 22, alignment: MONTH_ALIGN });
  ws.views = [{ state: 'frozen', ySplit: 2 }];

  const last = lastDataRow(report);
  for (const r of report.rows) {
    // La fecha va como celda Date real (día de RD, numFmt dd/mm/yyyy).
    const row = ws.addRow([
      r.no, excelDateCell(r.date), report.monthName, r.semana, r.tipo, r.programa, r.nombre, r.asistencia,
    ]);
    row.getCell(2).numFmt = EXCEL_DATE_FMT;
    for (const col of [1, 2, 3, 4, 8]) row.getCell(col).alignment = { horizontal: 'center' };

    // Dropdowns: Mes / Semana / Tipo estrictos; Programa permite texto libre con
    // aviso, porque las categorías de la actividad son abiertas.
    const n = row.number;
    listValidation(ws.getCell(n, 3), refs.mes, { strict: true, errorTitle: 'Mes no válido', error: 'Elige un mes de la lista.' });
    listValidation(ws.getCell(n, 4), refs.semana, { strict: true, errorTitle: 'Semana no válida', error: 'Elige una semana del 1 al 5.' });
    listValidation(ws.getCell(n, 5), refs.tipo, { strict: true, errorTitle: 'Tipo no válido', error: 'Elige un tipo de la lista.' });
    listValidation(ws.getCell(n, 6), refs.programa, {
      strict: false, errorTitle: 'Programa fuera de la lista', error: 'Este programa no está en la lista. ¿Quieres usarlo igual?',
    });
  }

  // Fila Total: =SUM de la asistencia (se recalcula si el departamento edita una fila).
  // Sin filas de datos la suma apunta al encabezado (texto → 0) para no autorreferirse.
  const sumRange = report.rows.length > 0 ? `H${FIRST_DATA_ROW}:H${last}` : 'H2:H2';
  addSumTotalRow(ws, { ncols: NCOLS, labelCol: 7, label: 'Total:', sumCol: 8, range: sumRange, cachedResult: report.totalAsistencia });

  applyAutoFilter(ws, 2, last, 'H');
  setColumnWidths(ws, WIDTHS);
  return ws;
}

function buildSummarySheet(wb: ExcelJS.Workbook, book: RegisterBook, p: Palette) {
  const rs = wb.addWorksheet('Resumen Mensual');
  const ncols = TIPO_ORDER.length + 2; // Mes + tipos + Total mensual
  const full = book.months.length === 12;
  titleRow(rs, full ? `RESUMEN MENSUAL ${book.year}` : `RESUMEN MENSUAL ${book.months[0]!.monthName.toUpperCase()} ${book.year}`, ncols, p);

  brandHeaderRow(rs, 2, ['Mes', ...TIPO_ORDER, 'Total mensual'], p, { height: 22, alignment: MONTH_ALIGN });
  rs.views = [{ state: 'frozen', ySplit: 2 }];

  const first = FIRST_DATA_ROW;
  book.months.forEach((m, i) => {
    const row = rs.getRow(first + i);
    row.getCell(1).value = m.monthName;
    row.getCell(1).font = { bold: true };
    // SUMIFS contra la hoja del mes: si el departamento corrige una fila, el resumen sigue.
    const sn = `'${sheetName(m.month)}'`;
    const to = m.rows.length > 0 ? lastDataRow(m) : FIRST_DATA_ROW;
    TIPO_ORDER.forEach((tipo, j) => {
      const col = j + 2;
      const letter = rs.getColumn(col).letter;
      const result = m.rows.filter((r) => r.tipo === tipo).reduce((a, r) => a + r.asistencia, 0);
      row.getCell(col).value = {
        formula: `SUMIFS(${sn}!$H$${FIRST_DATA_ROW}:$H$${to},${sn}!$E$${FIRST_DATA_ROW}:$E$${to},${letter}$2)`,
        result,
      };
    });
    row.getCell(ncols).value = {
      formula: `SUM(B${row.number}:${rs.getColumn(ncols - 1).letter}${row.number})`,
      result: m.rows.reduce((a, r) => a + r.asistencia, 0),
    };
    row.getCell(ncols).font = { bold: true };
    for (let c = 2; c <= ncols; c++) row.getCell(c).alignment = { horizontal: 'center' };
  });

  const lastRow = first + book.months.length - 1;
  const tot = rs.getRow(lastRow + 1);
  tot.getCell(1).value = full ? 'TOTAL ANUAL' : 'TOTAL';
  for (let c = 2; c <= ncols; c++) {
    const letter = rs.getColumn(c).letter;
    const result = c === ncols
      ? book.months.reduce((a, m) => a + m.totalAsistencia, 0)
      : book.months.reduce((a, m) => a + m.rows.filter((r) => r.tipo === TIPO_ORDER[c - 2]).reduce((x, r) => x + r.asistencia, 0), 0);
    tot.getCell(c).value = { formula: `SUM(${letter}${first}:${letter}${lastRow})`, result };
    tot.getCell(c).alignment = { horizontal: 'center' };
  }
  tot.eachCell((c) => { c.font = { bold: true }; c.border = { top: { style: 'thin' } }; });

  rs.getColumn(1).width = 16;
  for (let c = 2; c <= ncols; c++) rs.getColumn(c).width = c === ncols ? 16 : 22;
}

function buildListsSheet(wb: ExcelJS.Workbook, programas: string[]) {
  addListsSheet(wb, [
    { header: 'Tipo de actividad', values: TIPO_ORDER },
    { header: 'Programa', values: programas },
    { header: 'Mes', values: MESES_ES },
    { header: 'Semana', values: SEMANAS },
  ]);
}

/** Libro "Registro_Actividades_Culturales": N hojas de mes + Resumen Mensual + Listas (oculta). */
export async function buildRegisterWorkbook(book: RegisterBook, branding: ReportBranding): Promise<Buffer> {
  const palette: Palette = { brand: toArgb(branding.primaryColor), brandText: textArgb(branding.primaryColor) };
  const wb = new ExcelJS.Workbook();
  wb.creator = branding.name;
  const refs = listRefs(book.programas.length);
  for (const m of book.months) buildMonthSheet(wb, m, refs, palette);
  buildSummarySheet(wb, book, palette);
  buildListsSheet(wb, book.programas);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
