// apps/api-v2/src/services/reports/segment-export.ts · export de los miembros de
// un segmento de audiencia a Excel (branded por tenant) o CSV. Mismas columnas
// que la tabla en pantalla: identidad, contacto, asistencias, última visita y
// status de afinidad. Reusa el estilo de banda branded de los reportes.

import ExcelJS from 'exceljs';
import type { SegmentMember } from '@contan2/contracts';
import { CSV_BOM, csvRow, safeFilename } from '../csv.js';

const STATUS_LABEL: Record<string, string> = {
  activo: 'Activo', regular: 'Regular', dormido: 'Dormido', nuevo: 'Nuevo',
};

export interface SegmentExportOrg { name: string; primaryColor: string | null }
export interface SegmentExportMeta { label: string; description: string; count: number; generatedAt: string }

const HEADERS = ['Nombre', 'Código', 'Email', 'Teléfono', 'Asistencias', 'Última visita', 'Días desde última', 'Estado'] as const;

// '#e65100' → 'FFE65100' (ARGB de ExcelJS). Fallback al naranja de marca.
function toArgb(hex: string | null): string {
  const h = (hex ?? '').replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(h) ? `FF${h.toUpperCase()}` : 'FFE65100';
}

function fullName(m: SegmentMember): string {
  return `${m.firstName} ${m.lastName}`.trim() || '—';
}
function statusLabel(s: string): string {
  return STATUS_LABEL[s] ?? s;
}

export async function buildSegmentExcel(
  org: SegmentExportOrg,
  meta: SegmentExportMeta,
  members: SegmentMember[],
): Promise<ExcelJS.Workbook> {
  const brand = toArgb(org.primaryColor);
  const wb = new ExcelJS.Workbook();
  wb.creator = org.name;
  const ws = wb.addWorksheet('Segmento');

  // Banda de título branded.
  ws.mergeCells(1, 1, 1, HEADERS.length);
  const t = ws.getCell(1, 1);
  t.value = `${org.name} · ${meta.label}`;
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
  t.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 26;

  // Subtítulo: descripción + conteo + fecha de generación.
  ws.mergeCells(2, 1, 2, HEADERS.length);
  const s = ws.getCell(2, 1);
  s.value = `${meta.description} · ${meta.count} miembro${meta.count === 1 ? '' : 's'} · Generado el ${meta.generatedAt}`;
  s.font = { italic: true, color: { argb: 'FF555555' } };

  // Encabezado de tabla (fila 4).
  const head = ws.getRow(4);
  HEADERS.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
  });
  head.height = 20;

  for (const m of members) {
    ws.addRow([
      fullName(m),
      m.code,
      m.email ?? '',
      m.phone ?? '',
      m.totalAttendances,
      m.lastAttendanceAt ? m.lastAttendanceAt.slice(0, 10) : '—',
      m.daysSinceLastVisit ?? '',
      statusLabel(m.status),
    ]);
  }

  ws.getColumn(1).width = 28; ws.getColumn(2).width = 14; ws.getColumn(3).width = 32; ws.getColumn(4).width = 16;
  [5, 6, 7, 8].forEach((c) => (ws.getColumn(c).width = 15));
  ws.views = [{ state: 'frozen', ySplit: 4 }]; // encabezado fijo al scrollear

  return wb;
}

export function buildSegmentCsv(members: SegmentMember[]): string {
  const rows = [csvRow(HEADERS)];
  for (const m of members) {
    rows.push(csvRow([
      fullName(m), m.code, m.email ?? '', m.phone ?? '',
      m.totalAttendances, m.lastAttendanceAt ? m.lastAttendanceAt.slice(0, 10) : '',
      m.daysSinceLastVisit ?? '', statusLabel(m.status),
    ]));
  }
  return CSV_BOM + rows.join('\r\n');
}

function slug(label: string): string {
  return label.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'segmento';
}

export function segmentExportFilename(label: string, generatedAt: string, ext: 'xlsx' | 'csv'): string {
  return safeFilename(`segmento_${slug(label)}_${generatedAt}.${ext}`);
}
