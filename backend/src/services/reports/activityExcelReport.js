// =============================================================================
// activityExcelReport.js
// Genera un informe Excel profesional de asistencia para UNA actividad.
// Multi-hoja, branded con la organización (logo + color primario).
// =============================================================================

import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { generatePalette, pickOn } from '../../utils/palette.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'data', 'uploads');

const TYPE_LABELS = {
  exposicion: 'Exposición',
  concierto: 'Concierto',
  taller: 'Taller',
  teatro: 'Teatro',
  conferencia: 'Conferencia',
  otro: 'Otro',
};
const TYPE_LABEL = t => TYPE_LABELS[t] || t || '—';

const STATUS_LABELS = {
  activa: 'Activa',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
  borrador: 'Borrador',
};

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}
function fmtTimestamp(date = new Date()) {
  return date.toLocaleString('es-DO', { dateStyle: 'long', timeStyle: 'short' });
}

function hexToARGB(hex) {
  if (!hex) return null;
  const m = /^#?([a-f\d]{6})$/i.exec(hex);
  if (!m) return null;
  return 'FF' + m[1].toUpperCase();
}

async function loadLogoBuffer(logoUrl) {
  if (!logoUrl || !logoUrl.startsWith('/uploads/')) return null;
  const filename = path.basename(logoUrl);
  const filePath = path.join(UPLOADS_DIR, filename);
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase().replace('.', '') || 'jpeg';
    const extName = ext === 'jpg' ? 'jpeg' : ext;
    return { buffer: buf, extension: extName };
  } catch {
    return null;
  }
}

function categoryFor(priorAttendances) {
  // priorAttendances incluye la actividad actual; usamos totalAttendances - 1 ya
  // calculado fuera de aquí. Por seguridad chequeamos undefined.
  const n = Number(priorAttendances) || 0;
  if (n === 0) return 'Primera visita';
  if (n >= 10) return 'VIP';
  return 'Recurrente';
}

export async function buildActivityExcelReport({ organization, activity, attendances, users, affinities }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = organization.name || 'contan2-saas';
  wb.created = new Date();
  wb.lastModifiedBy = organization.name || 'contan2-saas';

  const palette = generatePalette(organization.primaryColor || '#1a237e') || {};
  const primaryArgb = hexToARGB(palette['700']) || hexToARGB(organization.primaryColor) || 'FF1A237E';
  const primaryLightArgb = hexToARGB(palette['50']) || 'FFEEEFFC';
  const accentArgb = hexToARGB(organization.secondaryColor) || 'FFFF6F00';
  const onPrimaryArgb = pickOn(palette['700'] || organization.primaryColor || '#1a237e') === '#ffffff'
    ? 'FFFFFFFF' : 'FF1F2937';
  const borderColor = { style: 'thin', color: { argb: 'FFE5E7EB' } };

  // -------- Sheet 1: Resumen ------------------------------------------------
  const s1 = wb.addWorksheet('Resumen', {
    properties: { tabColor: { argb: primaryArgb } },
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });
  s1.columns = [
    { width: 4 },
    { width: 24 },
    { width: 24 },
    { width: 24 },
    { width: 24 },
    { width: 4 },
  ];

  // Logo si existe (col B fila 2-5)
  const logo = await loadLogoBuffer(organization.logoUrl);
  if (logo) {
    const imageId = wb.addImage({ buffer: logo.buffer, extension: logo.extension });
    s1.addImage(imageId, {
      tl: { col: 1, row: 1 },
      ext: { width: 110, height: 80 },
    });
  }

  // Banda de marca (fila 1, todo el ancho)
  s1.mergeCells('A1:F1');
  const banner = s1.getCell('A1');
  banner.value = '';
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  s1.getRow(1).height = 6;

  // Título (filas 2-5, col C..E para no chocar con logo)
  s1.mergeCells('C2:E2');
  const eyebrow = s1.getCell('C2');
  eyebrow.value = (organization.name || '').toUpperCase();
  eyebrow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF6B7280' } };
  eyebrow.alignment = { vertical: 'middle' };

  s1.mergeCells('C3:E4');
  const title = s1.getCell('C3');
  title.value = 'Informe de Asistencia';
  title.font = { name: 'Calibri', size: 22, bold: true, color: { argb: 'FF1F2937' } };
  title.alignment = { vertical: 'middle' };

  s1.mergeCells('C5:E5');
  const subtitle = s1.getCell('C5');
  subtitle.value = `Generado ${fmtTimestamp()}`;
  subtitle.font = { name: 'Calibri', size: 10, color: { argb: 'FF6B7280' } };
  subtitle.alignment = { vertical: 'middle' };

  s1.getRow(6).height = 8;

  // Bloque actividad
  let row = 7;
  s1.mergeCells(`B${row}:E${row}`);
  const actHead = s1.getCell(`B${row}`);
  actHead.value = 'ACTIVIDAD';
  actHead.font = { name: 'Calibri', size: 10, bold: true, color: { argb: onPrimaryArgb } };
  actHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  actHead.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  s1.getRow(row).height = 22;
  row++;

  const actInfo = [
    ['Nombre', activity.name],
    ['Tipo', TYPE_LABEL(activity.type)],
    ['Fecha', fmtDate(activity.date)],
    ['Ubicación', activity.location || '—'],
    ['Estado', STATUS_LABELS[activity.status] || activity.status || '—'],
    ['Cupo', `${activity.enrolledCount} / ${activity.capacity}`],
  ];
  for (const [label, value] of actInfo) {
    const cellL = s1.getCell(`B${row}`);
    cellL.value = label;
    cellL.font = { name: 'Calibri', size: 11, color: { argb: 'FF6B7280' } };
    cellL.alignment = { vertical: 'middle' };
    cellL.border = { bottom: borderColor };
    s1.mergeCells(`C${row}:E${row}`);
    const cellV = s1.getCell(`C${row}`);
    cellV.value = value;
    cellV.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1F2937' } };
    cellV.alignment = { vertical: 'middle' };
    cellV.border = { bottom: borderColor };
    s1.getRow(row).height = 22;
    row++;
  }

  // Bloque KPIs
  row++;
  s1.mergeCells(`B${row}:E${row}`);
  const kpiHead = s1.getCell(`B${row}`);
  kpiHead.value = 'INDICADORES';
  kpiHead.font = { name: 'Calibri', size: 10, bold: true, color: { argb: onPrimaryArgb } };
  kpiHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  kpiHead.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  s1.getRow(row).height = 22;
  row++;

  const totalAtt = attendances.length;
  const newcomers = affinities.filter(a => a.totalAttendances === 1).length;
  const returning = totalAtt - newcomers;
  const vip = affinities.filter(a => a.totalAttendances >= 10).length;
  const showUpPct = activity.capacity ? Math.round((totalAtt / activity.capacity) * 100) : 0;

  const kpis = [
    { label: 'Inscritos', value: activity.enrolledCount, accent: false },
    { label: 'Asistencias', value: totalAtt, accent: true },
    { label: '% Ocupación', value: `${showUpPct}%`, accent: false },
    { label: 'Primera visita', value: newcomers, accent: false },
    { label: 'Recurrentes', value: returning, accent: false },
    { label: 'VIP (10+)', value: vip, accent: false },
  ];
  // Render KPIs en grid 3x2 (col B,C,D ; filas row+1, row+3 cada par)
  const cols = ['B', 'C', 'D', 'E'];
  // Span: cada KPI ocupa 1 columna. Usamos B..E (4 cols pero solo 3 KPIs por fila visible),
  // así que va de 3 por fila con merge BC, D, E? Mejor 3 KPIs por fila: B+C, D, E → no es simétrico.
  // Simplificamos: 2 KPIs por fila con merge BC y DE (2 columnas cada uno) → 3 filas total.
  const pairs = [[0, 1], [2, 3], [4, 5]];
  for (const [li, ri] of pairs) {
    const left = kpis[li], right = kpis[ri];
    // Left card
    s1.mergeCells(`B${row}:C${row}`);
    s1.getCell(`B${row}`).value = left.label;
    s1.getCell(`B${row}`).font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF6B7280' } };
    s1.getCell(`B${row}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    s1.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryLightArgb } };
    s1.mergeCells(`B${row + 1}:C${row + 1}`);
    s1.getCell(`B${row + 1}`).value = left.value;
    s1.getCell(`B${row + 1}`).font = {
      name: 'Calibri', size: 22, bold: true,
      color: { argb: left.accent ? accentArgb : primaryArgb },
    };
    s1.getCell(`B${row + 1}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    s1.getCell(`B${row + 1}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryLightArgb } };
    // Right card
    s1.mergeCells(`D${row}:E${row}`);
    s1.getCell(`D${row}`).value = right.label;
    s1.getCell(`D${row}`).font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF6B7280' } };
    s1.getCell(`D${row}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    s1.getCell(`D${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryLightArgb } };
    s1.mergeCells(`D${row + 1}:E${row + 1}`);
    s1.getCell(`D${row + 1}`).value = right.value;
    s1.getCell(`D${row + 1}`).font = {
      name: 'Calibri', size: 22, bold: true,
      color: { argb: right.accent ? accentArgb : primaryArgb },
    };
    s1.getCell(`D${row + 1}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    s1.getCell(`D${row + 1}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryLightArgb } };

    s1.getRow(row).height = 16;
    s1.getRow(row + 1).height = 30;
    row += 2;
    s1.getRow(row).height = 6; // spacer
    row++;
  }

  // -------- Sheet 2: Asistentes --------------------------------------------
  const s2 = wb.addWorksheet('Asistentes', {
    properties: { tabColor: { argb: primaryArgb } },
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });

  const headers = [
    { header: '#', key: 'idx', width: 6 },
    { header: 'Código', key: 'code', width: 14 },
    { header: 'Nombre', key: 'firstName', width: 20 },
    { header: 'Apellido', key: 'lastName', width: 20 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Teléfono', key: 'phone', width: 16 },
    { header: 'Hora check-in', key: 'checkin', width: 16 },
    { header: 'Asistencias previas', key: 'prior', width: 18 },
    { header: 'Categoría', key: 'category', width: 16 },
  ];
  s2.columns = headers;

  // Pinta el header con brand
  const headerRow = s2.getRow(1);
  headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: onPrimaryArgb } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  headerRow.height = 26;
  headerRow.eachCell({ includeEmpty: false }, cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
    cell.border = { bottom: { style: 'medium', color: { argb: accentArgb } } };
  });

  // Datos
  attendances.forEach((att, i) => {
    const u = users.find(x => x.id === att.userId);
    const aff = affinities[i];
    const prior = aff ? Math.max(0, aff.totalAttendances - 1) : 0;
    const cat = categoryFor(prior);
    const dataRow = s2.addRow({
      idx: i + 1,
      code: u?.code || att.userCode || '—',
      firstName: u?.firstName || '—',
      lastName: u?.lastName || '—',
      email: u?.email || '—',
      phone: u?.phone || '—',
      checkin: fmtTime(att.checkedInAt || att.registeredAt),
      prior,
      category: cat,
    });

    // Conditional highlight: primera visita = fondo accent suave
    if (cat === 'Primera visita') {
      dataRow.eachCell({ includeEmpty: false }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E6' } };
      });
    } else if (cat === 'VIP') {
      dataRow.eachCell({ includeEmpty: false }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryLightArgb } };
      });
    }
    dataRow.eachCell({ includeEmpty: false }, cell => {
      cell.border = { bottom: borderColor };
      cell.alignment = { vertical: 'middle', horizontal: cell.col === 1 ? 'center' : 'left', indent: 1 };
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF1F2937' } };
    });
  });

  // AutoFilter
  if (attendances.length > 0) {
    s2.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: attendances.length + 1, column: headers.length },
    };
  }

  // -------- Sheet 3: Análisis ----------------------------------------------
  const s3 = wb.addWorksheet('Análisis', {
    properties: { tabColor: { argb: primaryArgb } },
    views: [{ showGridLines: false }],
  });
  s3.columns = [{ width: 4 }, { width: 28 }, { width: 16 }, { width: 22 }, { width: 4 }];

  // Bloque: Distribución
  let r = 2;
  s3.mergeCells(`B${r}:D${r}`);
  s3.getCell(`B${r}`).value = 'DISTRIBUCIÓN DE ASISTENTES';
  s3.getCell(`B${r}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: onPrimaryArgb } };
  s3.getCell(`B${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  s3.getCell(`B${r}`).alignment = { vertical: 'middle', indent: 1 };
  s3.getRow(r).height = 22;
  r++;

  const distRows = [
    ['Primera visita', newcomers],
    ['Recurrentes', returning - vip],
    ['VIP (10+ visitas)', vip],
  ];
  for (const [label, count] of distRows) {
    const pct = totalAtt ? Math.round((count / totalAtt) * 100) : 0;
    s3.getCell(`B${r}`).value = label;
    s3.getCell(`C${r}`).value = count;
    s3.getCell(`D${r}`).value = `${pct}%`;
    [`B${r}`, `C${r}`, `D${r}`].forEach(addr => {
      s3.getCell(addr).font = { name: 'Calibri', size: 11, color: { argb: 'FF1F2937' } };
      s3.getCell(addr).border = { bottom: borderColor };
      s3.getCell(addr).alignment = { vertical: 'middle', indent: 1 };
    });
    s3.getCell(`D${r}`).font.bold = true;
    s3.getRow(r).height = 20;
    r++;
  }

  // Bloque: Check-ins por hora
  r += 2;
  s3.mergeCells(`B${r}:D${r}`);
  s3.getCell(`B${r}`).value = 'CHECK-INS POR HORA';
  s3.getCell(`B${r}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: onPrimaryArgb } };
  s3.getCell(`B${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  s3.getCell(`B${r}`).alignment = { vertical: 'middle', indent: 1 };
  s3.getRow(r).height = 22;
  r++;

  const byHour = new Map();
  for (const att of attendances) {
    const iso = att.checkedInAt || att.registeredAt;
    if (!iso) continue;
    const d = new Date(iso);
    if (isNaN(d.getTime())) continue;
    const h = d.getHours();
    byHour.set(h, (byHour.get(h) || 0) + 1);
  }
  const maxHourCount = byHour.size ? Math.max(...byHour.values()) : 0;
  const hours = Array.from(byHour.keys()).sort((a, b) => a - b);

  if (hours.length === 0) {
    s3.mergeCells(`B${r}:D${r}`);
    s3.getCell(`B${r}`).value = 'Sin check-ins registrados todavía';
    s3.getCell(`B${r}`).font = { italic: true, color: { argb: 'FF6B7280' } };
    s3.getCell(`B${r}`).alignment = { vertical: 'middle', indent: 1 };
  } else {
    for (const h of hours) {
      const count = byHour.get(h);
      const barLen = Math.max(1, Math.round((count / maxHourCount) * 20));
      const bar = '█'.repeat(barLen);
      s3.getCell(`B${r}`).value = `${String(h).padStart(2, '0')}:00 – ${String((h + 1) % 24).padStart(2, '0')}:00`;
      s3.getCell(`C${r}`).value = count;
      s3.getCell(`D${r}`).value = bar;
      s3.getCell(`B${r}`).font = { name: 'Calibri', size: 11 };
      s3.getCell(`C${r}`).font = { name: 'Calibri', size: 11, bold: true };
      s3.getCell(`D${r}`).font = { name: 'Calibri', size: 11, color: { argb: primaryArgb } };
      [`B${r}`, `C${r}`, `D${r}`].forEach(addr => {
        s3.getCell(addr).border = { bottom: borderColor };
        s3.getCell(addr).alignment = { vertical: 'middle', indent: 1 };
      });
      s3.getRow(r).height = 18;
      r++;
    }
  }

  // Pie del workbook: nota legal / firma
  r += 2;
  s3.mergeCells(`B${r}:D${r}`);
  s3.getCell(`B${r}`).value =
    `Informe generado automáticamente por ${organization.name}. Los datos provienen del registro oficial de asistencia.`;
  s3.getCell(`B${r}`).font = { italic: true, size: 9, color: { argb: 'FF9CA3AF' } };
  s3.getCell(`B${r}`).alignment = { vertical: 'middle', indent: 1, wrapText: true };

  return wb;
}

export function reportFilename(activity) {
  const base = (activity.name || 'actividad')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  const d = activity.date ? new Date(activity.date) : new Date();
  const stamp = isNaN(d.getTime()) ? '' : `_${d.toISOString().slice(0, 10)}`;
  return `Informe_${base}${stamp}.xlsx`;
}
