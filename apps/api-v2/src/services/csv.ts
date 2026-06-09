// apps/api-v2/src/services/csv.ts · serialización CSV segura.
//
// Anti CSV/Excel injection: una celda de TEXTO que empieza con = + - @ (o un
// carácter de control) se prefija con `'` para que Excel/Sheets la traten como
// texto y no ejecuten una fórmula. Los NÚMEROS legítimos (incluidos negativos)
// NO se tocan. Además se envuelve en comillas y se escapan las comillas cuando
// la celda contiene separador/comilla/salto de línea.

const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  const isNumber = typeof value === 'number' || PLAIN_NUMBER.test(s);
  if (!isNumber && DANGEROUS_PREFIX.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(',');
}

// BOM UTF-8 para que Excel abra los acentos correctamente.
export const CSV_BOM = '\uFEFF';

// Nombre de archivo seguro para Content-Disposition (sin path traversal ni
// caracteres de control). Colapsa lo no permitido a `-` y acota el largo.
export function safeFilename(base: string): string {
  return (
    base
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '') // sin puntos/guiones al borde (evita nombres ocultos / traversal)
      .slice(0, 120) || 'reporte'
  );
}
