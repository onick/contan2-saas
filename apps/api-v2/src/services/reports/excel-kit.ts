// apps/api-v2/src/services/reports/excel-kit.ts · helpers compartidos de exceljs
// para todos los libros (registro mensual, período, actividad, protocolo, puerta,
// visitantes, segmentos, biblioteca). Antes cada archivo copiaba su propio
// `toArgb`, banda de título, encabezado de marca y fila Total. La salida de los
// libros NO cambia: son los mismos estilos, ahora en un solo lugar.

import type ExcelJS from 'exceljs';
import { excelDateCell } from './fmt.js';

export { excelDateCell };

/** Naranja de marca del CCB (fallback cuando el tenant no tiene color válido). */
export const FALLBACK_BRAND_ARGB = 'FFF39228';
/** Formato de celda de fecha del departamento. */
export const EXCEL_DATE_FMT = 'dd/mm/yyyy';

/** '#f39228' → 'FFF39228'. `null` si no es un hex de 6 dígitos. */
export function hexToArgb(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim());
  return m ? `FF${m[1]!.toUpperCase()}` : null;
}

/** '#f39228' → 'FFF39228' (ARGB de ExcelJS). Fallback al naranja de marca CCB. */
export function toArgb(hex: string | null | undefined, fallback: string = FALLBACK_BRAND_ARGB): string {
  return hexToArgb(hex) ?? fallback;
}

export const solidFill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

export interface BrandPalette { brand: string; brandText: string }

/** Celda de encabezado con el color de marca (texto en negrita legible sobre él). */
export function brandHeaderCell(
  cell: ExcelJS.Cell,
  p: BrandPalette,
  alignment?: Partial<ExcelJS.Alignment>,
): void {
  cell.font = { bold: true, color: { argb: p.brandText } };
  cell.fill = solidFill(p.brand);
  if (alignment) cell.alignment = alignment;
}

/** Escribe `headers` como fila de encabezado de marca en `rowNumber`. */
export function brandHeaderRow(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  headers: readonly string[],
  p: BrandPalette,
  opts: { height?: number; alignment?: Partial<ExcelJS.Alignment> } = {},
): ExcelJS.Row {
  const row = ws.getRow(rowNumber);
  headers.forEach((h, i) => {
    const c = row.getCell(i + 1);
    c.value = h;
    brandHeaderCell(c, p, opts.alignment);
  });
  if (opts.height !== undefined) row.height = opts.height;
  return row;
}

/** Banda de título fusionada en la fila 1, con el color de marca. */
export function brandTitleBand(
  ws: ExcelJS.Worksheet,
  text: string,
  ncols: number,
  p: BrandPalette,
  horizontal: 'left' | 'center' = 'center',
): ExcelJS.Cell {
  ws.mergeCells(1, 1, 1, ncols);
  const t = ws.getCell(1, 1);
  t.value = text;
  t.font = { bold: true, size: 14, color: { argb: p.brandText } };
  t.fill = solidFill(p.brand);
  t.alignment = { vertical: 'middle', horizontal };
  ws.getRow(1).height = 26;
  return t;
}

/** Fila de subtítulo (período, conteos) fusionada, en cursiva gris. */
export function subtitleRow(ws: ExcelJS.Worksheet, rowNumber: number, ncols: number, text: string): ExcelJS.Cell {
  ws.mergeCells(rowNumber, 1, rowNumber, ncols);
  const c = ws.getCell(rowNumber, 1);
  c.value = text;
  c.font = { italic: true, color: { argb: 'FF555555' } };
  return c;
}

/** Anchos de columna por posición (el resto usa `fallback`). */
export function setColumnWidths(ws: ExcelJS.Worksheet, widths: readonly number[], fallback = 14): void {
  ws.columns.forEach((col, i) => { col.width = widths[i] ?? fallback; });
}

/** `autoFilter` sobre `A{headerRow}:{lastCol}{lastRow}` (nunca por encima del encabezado). */
export function applyAutoFilter(ws: ExcelJS.Worksheet, headerRow: number, lastRow: number, lastColLetter: string): void {
  ws.autoFilter = `A${headerRow}:${lastColLetter}${Math.max(lastRow, headerRow)}`;
}

/**
 * Fila Total con `=SUM(rango)` y su resultado en caché (los visores que no
 * recalculan muestran la cifra). `labelCol`/`sumCol` son 1-based.
 */
export function addSumTotalRow(
  ws: ExcelJS.Worksheet,
  opts: { ncols: number; labelCol: number; label: string; sumCol: number; range: string; cachedResult: number },
): ExcelJS.Row {
  const cells: Array<string | null> = Array.from({ length: opts.ncols }, () => '');
  cells[opts.labelCol - 1] = opts.label;
  cells[opts.sumCol - 1] = null;
  const total = ws.addRow(cells);
  total.getCell(opts.labelCol).font = { bold: true };
  total.getCell(opts.labelCol).alignment = { horizontal: 'right' };
  total.getCell(opts.sumCol).value = { formula: `SUM(${opts.range})`, result: opts.cachedResult };
  total.getCell(opts.sumCol).font = { bold: true };
  total.getCell(opts.sumCol).alignment = { horizontal: 'center' };
  return total;
}

/** Hoja oculta "Listas": una columna por lista (encabezado en fila 1) para dropdowns. */
export function addListsSheet(
  wb: ExcelJS.Workbook,
  columns: ReadonlyArray<{ header: string; values: readonly (string | number)[] }>,
  name = 'Listas',
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, { state: 'hidden' });
  columns.forEach((col, ci) => {
    ws.getCell(1, ci + 1).value = col.header;
    col.values.forEach((v, i) => { ws.getCell(i + 2, ci + 1).value = v; });
  });
  return ws;
}

/** Validación de lista (dropdown) sobre una celda; `strict` bloquea, si no avisa. */
export function listValidation(
  cell: ExcelJS.Cell,
  ref: string,
  opts: { strict: boolean; errorTitle: string; error: string },
): void {
  cell.dataValidation = {
    type: 'list', allowBlank: true, formulae: [ref], showErrorMessage: true,
    errorStyle: opts.strict ? 'stop' : 'warning', errorTitle: opts.errorTitle, error: opts.error,
  };
}
