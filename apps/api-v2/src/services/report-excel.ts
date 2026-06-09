// apps/api-v2/src/services/report-excel.ts · genera el .xlsx de asistencia-por-actividad
// con ExcelJS, branded por tenant (nombre + color de marca). Memoria acotada por la
// cota de filas de report-data (máx 5000); devuelve un Buffer listo para transmitir.
//
// Anti-injection: ExcelJS escribe los strings como valores de texto (ValueType
// String), NO como fórmulas — un valor que empieza con '=' queda como texto y no se
// ejecuta. Sólo se vuelve fórmula si se asigna { formula: ... }, cosa que NO hacemos.

import ExcelJS from 'exceljs';
import type { AttendanceByActivityReport } from './report-data.js';

export interface ReportBranding {
  name: string;
  primaryColor: string;
}

const HEADERS = [
  'Actividad', 'Fecha', 'Lugar', 'Categoría', 'Estado',
  'Capacidad', 'Inscritos', 'Check-ins', 'Personas', 'Anónimos', 'Ocupación %',
];

// '#e65100' → 'FFE65100' (ARGB de ExcelJS). Fallback al naranja de marca.
function toArgb(hex: string): string {
  const h = hex.replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(h) ? `FF${h.toUpperCase()}` : 'FFE65100';
}

export async function buildAttendanceWorkbook(
  report: AttendanceByActivityReport,
  branding: ReportBranding,
): Promise<Buffer> {
  const brand = toArgb(branding.primaryColor);
  const wb = new ExcelJS.Workbook();
  wb.creator = branding.name;
  const ws = wb.addWorksheet('Asistencia');

  // Título branded (banda con color de marca + texto blanco).
  ws.mergeCells(1, 1, 1, HEADERS.length);
  const title = ws.getCell(1, 1);
  title.value = `${branding.name} · Asistencia por actividad`;
  title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
  title.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 26;

  // Período.
  ws.mergeCells(2, 1, 2, HEADERS.length);
  const period = ws.getCell(2, 1);
  period.value = `Período: ${report.period.from} a ${report.period.to}`;
  period.font = { italic: true, color: { argb: 'FF555555' } };

  // Encabezado de columnas (fila 4; la 3 queda como separador).
  const head = ws.getRow(4);
  HEADERS.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
    c.alignment = { vertical: 'middle' };
  });
  head.height = 20;

  // Filas de datos (valores de texto/numéricos; nunca fórmulas).
  for (const r of report.rows) {
    ws.addRow([
      r.name, r.date.slice(0, 10), r.location, r.category ?? '', r.status,
      r.capacity, r.enrolledCount, r.attendances, r.people, r.anonymous, r.occupancyPct,
    ]);
  }

  // Totales.
  const total = ws.addRow([
    'TOTAL', '', '', '', '',
    report.totals.capacity, '', report.totals.attendances, report.totals.people, report.totals.anonymous, report.totals.occupancyPct,
  ]);
  total.font = { bold: true };

  // Anchos legibles.
  ws.columns.forEach((col, i) => {
    col.width = i === 0 ? 36 : i === 2 ? 22 : 14;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
