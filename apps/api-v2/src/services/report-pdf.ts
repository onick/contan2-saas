// apps/api-v2/src/services/report-pdf.ts · genera el PDF institucional de
// asistencia-por-actividad con PDFKit, branded por tenant (nombre + color de marca).
// Tabla paginada en landscape A4; el encabezado de columnas se repite por página.
// Usa Helvetica (fuente estándar de PDF, soporta acentos Latin-1) → sin archivos
// de fuente externos. Memoria acotada por la cota de filas de report-data; junta
// los chunks del stream de PDFKit en un Buffer listo para transmitir.

import PDFDocument from 'pdfkit';
import type { AttendanceByActivityReport } from './report-data.js';
import type { ReportBranding } from './report-excel.js';

interface Col {
  label: string;
  w: number;
  align: 'left' | 'right';
  value: (r: AttendanceByActivityReport['rows'][number]) => string;
  total: (t: AttendanceByActivityReport['totals']) => string;
}

const COLS: Col[] = [
  { label: 'Actividad', w: 150, align: 'left', value: (r) => r.name, total: () => 'TOTAL' },
  { label: 'Fecha', w: 58, align: 'left', value: (r) => r.date.slice(0, 10), total: () => '' },
  { label: 'Lugar', w: 95, align: 'left', value: (r) => r.location, total: () => '' },
  { label: 'Categoría', w: 68, align: 'left', value: (r) => r.category ?? '', total: () => '' },
  { label: 'Estado', w: 68, align: 'left', value: (r) => r.status, total: () => '' },
  { label: 'Cap.', w: 50, align: 'right', value: (r) => String(r.capacity), total: (t) => String(t.capacity) },
  { label: 'Inscr.', w: 50, align: 'right', value: (r) => String(r.enrolledCount), total: () => '' },
  { label: 'Check-ins', w: 55, align: 'right', value: (r) => String(r.attendances), total: (t) => String(t.attendances) },
  { label: 'Personas', w: 50, align: 'right', value: (r) => String(r.people), total: (t) => String(t.people) },
  { label: 'Anón.', w: 55, align: 'right', value: (r) => String(r.anonymous), total: (t) => String(t.anonymous) },
  { label: 'Ocup. %', w: 63, align: 'right', value: (r) => String(r.occupancyPct), total: (t) => String(t.occupancyPct) },
];

const MARGIN = 40;
const ROW_H = 16;
const brandHex = (hex: string) => (/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#e65100');

// Trunca el texto con … para que entre en el ancho de la celda.
function fit(doc: PDFKit.PDFDocument, text: string, w: number): string {
  const pad = 8;
  if (doc.widthOfString(text) <= w - pad) return text;
  let s = text;
  while (s.length > 1 && doc.widthOfString(`${s}…`) > w - pad) s = s.slice(0, -1);
  return `${s}…`;
}

export function buildAttendancePdf(report: AttendanceByActivityReport, branding: ReportBranding): Promise<Buffer> {
  const brand = brandHex(branding.primaryColor);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN });

  const done = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = MARGIN;
  const right = doc.page.width - MARGIN;
  const bottom = doc.page.height - MARGIN;

  // Encabezado institucional (banda de marca).
  doc.rect(0, 0, doc.page.width, 54).fill(brand);
  doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text(branding.name, left, 14);
  doc.fontSize(11).font('Helvetica').text('Asistencia por actividad', left, 34);
  doc.fillColor('#555555').fontSize(9).text(`Período: ${report.period.from} a ${report.period.to}`, left, 34, { width: right - left, align: 'right' });

  let y = 70;

  const drawHeader = () => {
    doc.rect(left, y, right - left, ROW_H + 2).fill(brand);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    let x = left;
    for (const col of COLS) {
      doc.text(fit(doc, col.label, col.w), x + 3, y + 4, { width: col.w - 6, align: col.align });
      x += col.w;
    }
    y += ROW_H + 2;
    doc.fillColor('#222222').font('Helvetica').fontSize(8);
  };

  const ensureSpace = () => {
    if (y + ROW_H > bottom) {
      doc.addPage();
      y = MARGIN;
      drawHeader();
    }
  };

  drawHeader();
  for (const r of report.rows) {
    ensureSpace();
    let x = left;
    for (const col of COLS) {
      doc.text(fit(doc, col.value(r), col.w), x + 3, y + 4, { width: col.w - 6, align: col.align });
      x += col.w;
    }
    doc.moveTo(left, y + ROW_H).lineTo(right, y + ROW_H).strokeColor('#eeeeee').lineWidth(0.5).stroke();
    y += ROW_H;
  }

  // Fila de totales.
  ensureSpace();
  doc.rect(left, y, right - left, ROW_H).fill('#f5f5f5');
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8);
  let xt = left;
  for (const col of COLS) {
    doc.text(fit(doc, col.total(report.totals), col.w), xt + 3, y + 4, { width: col.w - 6, align: col.align });
    xt += col.w;
  }

  doc.end();
  return done;
}
