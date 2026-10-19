// PORT VERBATIM de v1 (backend/src/services/reports/periodExcelReport.js) · 2026-06-11.
// Plantilla PURA probada en producción v1; el tipado estricto queda como pase
// posterior (los tests de integración la ejercitan end-to-end: el Excel se
// re-parsea con exceljs y el HTML se valida). Cambios respecto a v1: imports
// de palette → branding-tokens, y el logo llega por loadLogoDataUri (URL,
// con rasterizado de SVG) en lugar de leerse del filesystem.
// @ts-nocheck
/* eslint-disable */
// =============================================================================
// periodExcelReport.js · Excel branded de período (mensual/anual/custom).
// Multi-sheet: Resumen + Actividades + Por tipo + Evolución mensual + Top visitantes.
// =============================================================================

import ExcelJS from 'exceljs';
import { generatePalette, textArgb } from '../branding-tokens.js';
import { loadLogoDataUri } from '../credential.js';
import { fmtDateTz, fmtTimeTz, fmtYmd } from './fmt.js';
import { fmtDeltaPct, fmtDeltaPoints } from './metrics.js';


const STATUS_LABELS = { activa: 'Activa', finalizada: 'Finalizada', cancelada: 'Cancelada', borrador: 'Borrador' };

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return fmtDateTz(d);
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return fmtDateTz(d) + ' · ' + fmtTimeTz(d);
}
// from/to son días 'YYYY-MM-DD' del tenant (rango inclusivo del PeriodEngine).
function rangeLabel(from, to) {
  return `${fmtYmd(from)} → ${fmtYmd(to)}`;
}
function hexToARGB(hex) {
  if (!hex) return null;
  const m = /^#?([a-f\d]{6})$/i.exec(hex);
  return m ? 'FF' + m[1].toUpperCase() : null;
}

async function loadLogoBuffer(logoUrl) {
  // v2: el logo llega por URL (loadLogoDataUri fetchea y rasteriza SVG→PNG);
  // exceljs sólo acepta png/jpeg/gif como imagen embebida.
  const dataUri = await loadLogoDataUri(logoUrl);
  if (!dataUri) return null;
  const m = /^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/.exec(dataUri);
  if (!m) return null;
  const extension = m[1] === 'jpg' ? 'jpeg' : m[1];
  return { buffer: Buffer.from(m[2], 'base64'), extension };
}

export async function buildPeriodExcelReport({ organization, period }) {
  // `period` = resultado de periodEngine (period-engine.ts): una sola fuente de cifras.
  const cur = period.current, prev = period.previous, k = cur.kpis, pk = prev.kpis;
  const wb = new ExcelJS.Workbook();
  wb.creator = organization.name || 'contan2-saas';
  wb.created = new Date();

  const palette = generatePalette(organization.primaryColor || '#f39228') || {};
  const primaryArgb = hexToARGB(palette['700']) || 'FFF39228';
  const primaryLightArgb = hexToARGB(palette['50']) || 'FFFEF4E8';
  const accentArgb = hexToARGB(organization.secondaryColor) || 'FF31A3DB';
  const onPrimaryArgb = textArgb(palette['700'] || organization.primaryColor || '#f39228');
  const border = { style: 'thin', color: { argb: 'FFE5E7EB' } };

  // -------- Sheet 1: Resumen --------
  const s1 = wb.addWorksheet('Resumen', {
    properties: { tabColor: { argb: primaryArgb } },
    views: [{ showGridLines: false }],
  });
  s1.columns = [{ width: 4 }, { width: 24 }, { width: 24 }, { width: 24 }, { width: 24 }, { width: 4 }];

  // Banda + logo
  s1.mergeCells('A1:F1');
  s1.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  s1.getRow(1).height = 6;

  const logo = await loadLogoBuffer(organization.logoUrl);
  if (logo) {
    const imageId = wb.addImage({ buffer: logo.buffer, extension: logo.extension });
    s1.addImage(imageId, { tl: { col: 1, row: 1 }, ext: { width: 110, height: 80 } });
  }

  s1.mergeCells('C2:E2');
  s1.getCell('C2').value = (organization.name || '').toUpperCase();
  s1.getCell('C2').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF6B7280' } };
  s1.mergeCells('C3:E4');
  s1.getCell('C3').value = 'Informe de Período';
  s1.getCell('C3').font = { name: 'Calibri', size: 22, bold: true, color: { argb: 'FF1F2937' } };
  s1.getCell('C3').alignment = { vertical: 'middle' };
  s1.mergeCells('C5:E5');
  s1.getCell('C5').value = `${rangeLabel(period.range.from, period.range.to)} · Generado ${fmtDateTime(new Date())}`;
  s1.getCell('C5').font = { name: 'Calibri', size: 10, color: { argb: 'FF6B7280' } };

  s1.getRow(6).height = 8;

  // KPIs
  let row = 7;
  s1.mergeCells(`B${row}:E${row}`);
  s1.getCell(`B${row}`).value = 'INDICADORES DEL PERÍODO';
  s1.getCell(`B${row}`).font = { bold: true, size: 10, color: { argb: onPrimaryArgb } };
  s1.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  s1.getCell(`B${row}`).alignment = { vertical: 'middle', indent: 1 };
  s1.getRow(row).height = 22;
  row++;

  const kpis = [
    { label: 'Actividades realizadas', value: k.activities, accent: false },
    { label: 'Personas', value: k.people, accent: true },
    { label: 'Registros', value: k.attendances, accent: false },
    { label: 'Visitantes únicos', value: k.uniqueVisitors, accent: false },
    { label: 'Ocupación (personas / aforo)', value: `${k.occupancyPct}%`, accent: false },
    { label: 'Tipos de actividad', value: cur.byType.length, accent: false },
  ];
  const pairs = [[0, 1], [2, 3], [4, 5]];
  for (const [li, ri] of pairs) {
    const left = kpis[li], right = kpis[ri];
    s1.mergeCells(`B${row}:C${row}`);
    s1.getCell(`B${row}`).value = left.label;
    s1.getCell(`B${row}`).font = { size: 9, bold: true, color: { argb: 'FF6B7280' } };
    s1.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryLightArgb } };
    s1.getCell(`B${row}`).alignment = { vertical: 'middle', indent: 1 };
    s1.mergeCells(`B${row + 1}:C${row + 1}`);
    s1.getCell(`B${row + 1}`).value = left.value;
    s1.getCell(`B${row + 1}`).font = { size: 22, bold: true, color: { argb: left.accent ? accentArgb : primaryArgb } };
    s1.getCell(`B${row + 1}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryLightArgb } };
    s1.getCell(`B${row + 1}`).alignment = { vertical: 'middle', indent: 1 };
    s1.mergeCells(`D${row}:E${row}`);
    s1.getCell(`D${row}`).value = right.label;
    s1.getCell(`D${row}`).font = { size: 9, bold: true, color: { argb: 'FF6B7280' } };
    s1.getCell(`D${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryLightArgb } };
    s1.getCell(`D${row}`).alignment = { vertical: 'middle', indent: 1 };
    s1.mergeCells(`D${row + 1}:E${row + 1}`);
    s1.getCell(`D${row + 1}`).value = right.value;
    s1.getCell(`D${row + 1}`).font = { size: 22, bold: true, color: { argb: right.accent ? accentArgb : primaryArgb } };
    s1.getCell(`D${row + 1}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryLightArgb } };
    s1.getCell(`D${row + 1}`).alignment = { vertical: 'middle', indent: 1 };
    s1.getRow(row).height = 16;
    s1.getRow(row + 1).height = 30;
    row += 2;
    s1.getRow(row).height = 6;
    row++;
  }

  // Comparación con el período anterior (P4: mismo tramo del mes anterior).
  row++;
  s1.mergeCells(`B${row}:E${row}`);
  s1.getCell(`B${row}`).value = `COMPARACIÓN CON EL PERÍODO ANTERIOR (${period.previousRange.from} → ${period.previousRange.to})`;
  s1.getCell(`B${row}`).font = { bold: true, size: 10, color: { argb: onPrimaryArgb } };
  s1.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  s1.getCell(`B${row}`).alignment = { vertical: 'middle', indent: 1 };
  s1.getRow(row).height = 22;
  row++;
  s1.getCell(`B${row}`).value = 'Indicador';
  s1.getCell(`C${row}`).value = 'Anterior';
  s1.getCell(`D${row}`).value = 'Variación';
  [`B${row}`, `C${row}`, `D${row}`].forEach(addr => {
    s1.getCell(addr).font = { bold: true, size: 10, color: { argb: 'FF6B7280' } };
    s1.getCell(addr).border = { bottom: { style: 'medium', color: { argb: primaryArgb } } };
    s1.getCell(addr).alignment = { vertical: 'middle', indent: 1 };
  });
  row++;
  const cmpRows = [
    ['Actividades (anterior)', pk.activities, fmtDeltaPct(period.deltas.activities)],
    ['Personas (anterior)', pk.people, fmtDeltaPct(period.deltas.people)],
    ['Registros (anterior)', pk.attendances, fmtDeltaPct(period.deltas.attendances)],
    ['Visitantes únicos (anterior)', pk.uniqueVisitors, fmtDeltaPct(period.deltas.uniqueVisitors)],
    // La ocupación se compara en PUNTOS porcentuales, no en %.
    ['Ocupación (anterior)', `${pk.occupancyPct}%`, fmtDeltaPoints(period.deltas.occupancyPct)],
  ];
  for (const [label, value, delta] of cmpRows) {
    s1.getCell(`B${row}`).value = label;
    s1.getCell(`C${row}`).value = value;
    s1.getCell(`D${row}`).value = delta;
    [`B${row}`, `C${row}`, `D${row}`].forEach(addr => {
      s1.getCell(addr).font = { size: 11, color: { argb: 'FF1F2937' } };
      s1.getCell(addr).border = { bottom: border };
      s1.getCell(addr).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    });
    s1.getRow(row).height = 20;
    row++;
  }

  // Top 5 actividades (por personas)
  row++;
  s1.mergeCells(`B${row}:E${row}`);
  s1.getCell(`B${row}`).value = 'TOP 5 ACTIVIDADES POR PERSONAS';
  s1.getCell(`B${row}`).font = { bold: true, size: 10, color: { argb: onPrimaryArgb } };
  s1.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  s1.getCell(`B${row}`).alignment = { vertical: 'middle', indent: 1 };
  s1.getRow(row).height = 22;
  row++;
  const top5 = [...cur.activities].sort((x, y) => y.people - x.people || y.attendances - x.attendances).slice(0, 5);
  for (const t of top5) {
    s1.getCell(`B${row}`).value = t.name;
    s1.getCell(`C${row}`).value = t.typeLabel;
    s1.getCell(`D${row}`).value = t.people;
    s1.getCell(`E${row}`).value = `${t.occupancyPct}%`;
    [`B${row}`, `C${row}`, `D${row}`, `E${row}`].forEach(addr => {
      s1.getCell(addr).font = { size: 11, color: { argb: 'FF1F2937' } };
      s1.getCell(addr).border = { bottom: border };
      s1.getCell(addr).alignment = { vertical: 'middle', indent: 1 };
    });
    s1.getCell(`D${row}`).font.bold = true;
    s1.getRow(row).height = 20;
    row++;
  }

  // -------- Sheet 2: Actividades --------
  const s2 = wb.addWorksheet('Actividades', {
    properties: { tabColor: { argb: primaryArgb } },
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  s2.columns = [
    { header: '#', key: 'idx', width: 6 },
    { header: 'Actividad', key: 'name', width: 36 },
    { header: 'Tipo', key: 'type', width: 14 },
    { header: 'Fecha', key: 'date', width: 18 },
    { header: 'Ubicación', key: 'location', width: 28 },
    { header: 'Capacidad', key: 'capacity', width: 12 },
    { header: 'Personas', key: 'people', width: 12 },
    { header: 'Registros', key: 'attendances', width: 12 },
    { header: '% Ocupación', key: 'occupancy', width: 14 },
    { header: 'Estado', key: 'status', width: 14 },
  ];
  const headerRow = s2.getRow(1);
  headerRow.font = { bold: true, size: 11, color: { argb: onPrimaryArgb } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  headerRow.height = 26;
  headerRow.eachCell({ includeEmpty: false }, cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
    cell.border = { bottom: { style: 'medium', color: { argb: accentArgb } } };
  });

  cur.activities.forEach((a, i) => {
    const dr = s2.addRow({
      idx: i + 1,
      name: a.name,
      type: a.typeLabel,
      date: fmtDateTime(a.date),
      location: a.location,
      capacity: a.capacity,
      people: a.people,
      attendances: a.attendances,
      occupancy: `${a.occupancyPct}%`,
      status: STATUS_LABELS[a.status] || a.status,
    });
    dr.eachCell({ includeEmpty: false }, cell => {
      cell.border = { bottom: border };
      cell.alignment = { vertical: 'middle', horizontal: cell.col === 1 ? 'center' : 'left', indent: 1 };
      cell.font = { size: 11, color: { argb: 'FF1F2937' } };
    });
  });
  if (cur.activities.length) {
    s2.autoFilter = { from: { row: 1, column: 1 }, to: { row: cur.activities.length + 1, column: 10 } };
  }

  // -------- Sheet 3: Por tipo --------
  const s3 = wb.addWorksheet('Por tipo', {
    properties: { tabColor: { argb: primaryArgb } },
    views: [{ showGridLines: false }],
  });
  s3.columns = [{ width: 4 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 4 }];
  let r3 = 2;
  s3.mergeCells(`B${r3}:E${r3}`);
  s3.getCell(`B${r3}`).value = 'DISTRIBUCIÓN POR TIPO';
  s3.getCell(`B${r3}`).font = { bold: true, size: 10, color: { argb: onPrimaryArgb } };
  s3.getCell(`B${r3}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  s3.getCell(`B${r3}`).alignment = { vertical: 'middle', indent: 1 };
  s3.getRow(r3).height = 22;
  r3++;
  s3.getCell(`B${r3}`).value = 'Tipo';
  s3.getCell(`C${r3}`).value = 'Actividades';
  s3.getCell(`D${r3}`).value = 'Personas';
  s3.getCell(`E${r3}`).value = 'Registros';
  [`B${r3}`, `C${r3}`, `D${r3}`, `E${r3}`].forEach(addr => {
    s3.getCell(addr).font = { bold: true, size: 10, color: { argb: 'FF6B7280' } };
    s3.getCell(addr).border = { bottom: { style: 'medium', color: { argb: primaryArgb } } };
    s3.getCell(addr).alignment = { vertical: 'middle', indent: 1 };
  });
  r3++;
  for (const t of cur.byType) {
    s3.getCell(`B${r3}`).value = t.label;
    s3.getCell(`C${r3}`).value = t.activities;
    s3.getCell(`D${r3}`).value = t.people;
    s3.getCell(`E${r3}`).value = t.attendances;
    [`B${r3}`, `C${r3}`, `D${r3}`, `E${r3}`].forEach(addr => {
      s3.getCell(addr).font = { size: 11, color: { argb: 'FF1F2937' } };
      s3.getCell(addr).border = { bottom: border };
      s3.getCell(addr).alignment = { vertical: 'middle', indent: 1 };
    });
    s3.getCell(`D${r3}`).font.bold = true;
    s3.getRow(r3).height = 20;
    r3++;
  }

  // -------- Sheet 4: Evolución mensual --------
  const s4 = wb.addWorksheet('Evolución mensual', {
    properties: { tabColor: { argb: primaryArgb } },
    views: [{ showGridLines: false }],
  });
  s4.columns = [{ width: 4 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 26 }, { width: 4 }];
  let r4 = 2;
  s4.mergeCells(`B${r4}:F${r4}`);
  s4.getCell(`B${r4}`).value = 'EVOLUCIÓN MES A MES';
  s4.getCell(`B${r4}`).font = { bold: true, size: 10, color: { argb: onPrimaryArgb } };
  s4.getCell(`B${r4}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  s4.getCell(`B${r4}`).alignment = { vertical: 'middle', indent: 1 };
  s4.getRow(r4).height = 22;
  r4++;
  s4.getCell(`B${r4}`).value = 'Mes';
  s4.getCell(`C${r4}`).value = 'Actividades';
  s4.getCell(`D${r4}`).value = 'Personas';
  s4.getCell(`E${r4}`).value = 'Registros';
  s4.getCell(`F${r4}`).value = '';
  [`B${r4}`, `C${r4}`, `D${r4}`, `E${r4}`, `F${r4}`].forEach(addr => {
    s4.getCell(addr).font = { bold: true, size: 10, color: { argb: 'FF6B7280' } };
    s4.getCell(addr).border = { bottom: { style: 'medium', color: { argb: primaryArgb } } };
    s4.getCell(addr).alignment = { vertical: 'middle', indent: 1 };
  });
  r4++;
  const maxAtt = cur.byMonth.reduce((m, x) => Math.max(m, x.people), 1);
  for (const m of cur.byMonth) {
    s4.getCell(`B${r4}`).value = m.label;
    s4.getCell(`C${r4}`).value = m.activities;
    s4.getCell(`D${r4}`).value = m.people;
    s4.getCell(`E${r4}`).value = m.attendances;
    const barLen = Math.max(1, Math.round((m.people / maxAtt) * 20));
    s4.getCell(`F${r4}`).value = '█'.repeat(barLen);
    [`B${r4}`, `C${r4}`, `D${r4}`, `E${r4}`, `F${r4}`].forEach(addr => {
      s4.getCell(addr).font = { size: 11, color: { argb: 'FF1F2937' } };
      s4.getCell(addr).border = { bottom: border };
      s4.getCell(addr).alignment = { vertical: 'middle', indent: 1 };
    });
    s4.getCell(`D${r4}`).font.bold = true;
    s4.getCell(`F${r4}`).font = { size: 11, color: { argb: primaryArgb } };
    s4.getRow(r4).height = 20;
    r4++;
  }

  // -------- Sheet 5: Top visitantes --------
  if (cur.topUsers.length) {
    const s5 = wb.addWorksheet('Top visitantes', {
      properties: { tabColor: { argb: primaryArgb } },
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    s5.columns = [
      { header: '#', key: 'idx', width: 6 },
      { header: 'Código', key: 'code', width: 14 },
      { header: 'Nombre', key: 'firstName', width: 20 },
      { header: 'Apellido', key: 'lastName', width: 20 },
      { header: 'Visitas en período', key: 'visitsInPeriod', width: 18 },
      { header: 'Total visitas', key: 'totalVisits', width: 16 },
    ];
    const hr = s5.getRow(1);
    hr.font = { bold: true, size: 11, color: { argb: onPrimaryArgb } };
    hr.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    hr.height = 26;
    hr.eachCell({ includeEmpty: false }, cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
      cell.border = { bottom: { style: 'medium', color: { argb: accentArgb } } };
    });
    cur.topUsers.forEach((u, i) => {
      const dr = s5.addRow({
        idx: i + 1,
        code: u.code, firstName: u.firstName, lastName: u.lastName,
        visitsInPeriod: u.visitsInPeriod, totalVisits: u.totalVisits,
      });
      dr.eachCell({ includeEmpty: false }, cell => {
        cell.border = { bottom: border };
        cell.alignment = { vertical: 'middle', horizontal: cell.col === 1 ? 'center' : 'left', indent: 1 };
        cell.font = { size: 11, color: { argb: 'FF1F2937' } };
      });
    });
  }

  return wb;
}

// from/to: días 'YYYY-MM-DD' del tenant (rango inclusivo).
export function periodFilename(from, to) {
  return from === to ? `Informe_periodo_${from}.xlsx` : `Informe_periodo_${from}_a_${to}.xlsx`;
}
