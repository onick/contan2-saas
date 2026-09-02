// apps/api-v2/src/services/biblio-export.ts · genera el .xlsx del CATÁLOGO de
// la Biblioteca con ExcelJS, branded por tenant (mismo patrón que el export de
// Puerta). Cada fila = un título con sus conteos de ejemplares y sitios.
// Anti-injection: los strings van como texto plano (nunca fórmulas).

import ExcelJS from 'exceljs';

export interface BiblioExportRow {
  kind: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  isbn: string | null;
  publisher: string | null;
  year: number | null;
  language: string | null;
  dewey: string | null;
  callNumber: string | null;
  subjects: string[];
  itemsTotal: number;
  itemsActive: number;
  siteNames: string[];
}

export interface BiblioExportMeta {
  orgName: string;
  primaryColor: string | null;
  filterLabel: string; // "Todo el catálogo" | "Libros · Sala VR" | …
}

const HEADERS = [
  'Tipo', 'Título', 'Subtítulo', 'Autores', 'ISBN', 'Editorial', 'Año',
  'Idioma', 'Dewey', 'Signatura', 'Materias', 'Ejemplares', 'Disponibles', 'Ubicación',
];

const KIND_LABEL: Record<string, string> = {
  libro: 'Libro', revista: 'Revista', periodico: 'Periódico',
  tesis: 'Tesis', audiovisual: 'Audiovisual', documento: 'Documento',
};

// '#e65100' → 'FFE65100' (ARGB de ExcelJS). Fallback al naranja de marca.
function toArgb(hex: string | null): string {
  const h = (hex ?? '').replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(h) ? `FF${h.toUpperCase()}` : 'FFE65100';
}

export async function buildBiblioExportWorkbook(
  rows: BiblioExportRow[],
  meta: BiblioExportMeta,
): Promise<Buffer> {
  const brand = toArgb(meta.primaryColor);
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.orgName;
  const ws = wb.addWorksheet('Catálogo');

  ws.mergeCells(1, 1, 1, HEADERS.length);
  const title = ws.getCell(1, 1);
  title.value = `${meta.orgName} · Catálogo de la Biblioteca — ${meta.filterLabel}`;
  title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, HEADERS.length);
  const sub = ws.getCell(2, 1);
  sub.value = `${rows.length.toLocaleString('en-US')} títulos · generado ${new Date().toISOString().slice(0, 10)}`;
  sub.font = { size: 10, color: { argb: 'FF636769' } };

  const head = ws.getRow(4);
  HEADERS.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
    c.alignment = { vertical: 'middle' };
  });
  head.height = 18;

  rows.forEach((r, idx) => {
    const row = ws.getRow(5 + idx);
    const vals: (string | number)[] = [
      KIND_LABEL[r.kind] ?? r.kind, r.title, r.subtitle ?? '', r.authors.join('; '),
      r.isbn ?? '', r.publisher ?? '', r.year ?? '', r.language ?? '',
      r.dewey ?? '', r.callNumber ?? '', r.subjects.join('; '),
      r.itemsTotal, r.itemsActive, r.siteNames.join('; '),
    ];
    vals.forEach((v, i) => { row.getCell(i + 1).value = v; });
    if (idx % 2 === 1) {
      for (let i = 1; i <= HEADERS.length; i += 1) {
        row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F7F8' } };
      }
    }
  });

  const widths = [11, 42, 26, 30, 16, 20, 7, 10, 11, 16, 30, 11, 12, 26];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: 4 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
