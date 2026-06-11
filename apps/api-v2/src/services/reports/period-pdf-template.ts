// PORT VERBATIM de v1 (backend/src/services/reports/periodPdfTemplate.js) · 2026-06-11.
// Plantilla PURA probada en producción v1; el tipado estricto queda como pase
// posterior (los tests de integración la ejercitan end-to-end: el Excel se
// re-parsea con exceljs y el HTML se valida). Cambios respecto a v1: imports
// de palette → branding-tokens, y el logo llega por loadLogoDataUri (URL,
// con rasterizado de SVG) en lugar de leerse del filesystem.
// @ts-nocheck
/* eslint-disable */
// =============================================================================
// periodPdfTemplate.js · plantilla HTML para reporte PDF de período.
// Reusa los tokens del branding multi-tenant.
// =============================================================================

import { generatePalette, pickOn } from '../branding-tokens.js';
import { loadLogoDataUri } from '../credential.js';


const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—'
    : d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}
function rangeLabel(from, to) {
  return `${fmtDate(from)} → ${fmtDate(new Date(new Date(to).getTime() - 86400000))}`;
}


const STATUS_LABELS = { activa: 'Activa', finalizada: 'Finalizada', cancelada: 'Cancelada', borrador: 'Borrador' };
const STATUS_CLS = { activa: 'ok', finalizada: 'muted', cancelada: 'danger', borrador: 'muted' };

export async function buildPeriodPdfHtml({ organization, period }) {
  const palette = generatePalette(organization.primaryColor || '#1a237e') || {};
  const primary = palette['700'] || organization.primaryColor || '#1a237e';
  const primaryLight = palette['50'] || '#eeeffc';
  const primary100 = palette['100'] || '#d5d8f6';
  const primary900 = palette['900'] || '#0d144f';
  const accent = organization.secondaryColor || '#ff6f00';
  const onPrimary = pickOn(primary);
  const onAccent = pickOn(accent);
  const logo = await loadLogoDataUri(organization.logoUrl);

  const maxAtt = Math.max(1, ...period.byMonth.map(m => m.attendances));
  const maxType = Math.max(1, ...period.byType.map(t => t.attendances));

  const topActivitiesRows = period.topActivities.map((t, i) => `
    <tr>
      <td class="idx">${i + 1}</td>
      <td><strong>${esc(t.name)}</strong><div class="muted">${esc(t.typeLabel)} · ${esc(fmtDate(t.date))}</div></td>
      <td class="num">${t.attendances}</td>
      <td class="num">${t.occupancyPct}%</td>
    </tr>`).join('');

  const byTypeRows = period.byType.map(t => `
    <div class="bar-row">
      <span class="bar-label">${esc(t.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round((t.attendances / maxType) * 100)}%; background:${primary}"></span></span>
      <span class="bar-value">${t.attendances}</span>
    </div>`).join('');

  const byMonthRows = period.byMonth.map(m => `
    <div class="bar-row">
      <span class="bar-label">${esc(m.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round((m.attendances / maxAtt) * 100)}%; background:${accent}"></span></span>
      <span class="bar-value">${m.attendances}</span>
    </div>`).join('');

  const activityRows = period.activities.map((a, i) => `
    <tr>
      <td class="idx">${i + 1}</td>
      <td>${esc(a.name)}</td>
      <td>${esc(a.typeLabel)}</td>
      <td class="num">${esc(fmtDate(a.date))}</td>
      <td class="num">${a.attendances}</td>
      <td class="num">${a.occupancyPct}%</td>
      <td><span class="tag tag--${STATUS_CLS[a.status] || 'muted'}">${esc(STATUS_LABELS[a.status] || a.status)}</span></td>
    </tr>`).join('');

  const topUserRows = period.topUsers.map((u, i) => `
    <tr>
      <td class="idx">${i + 1}</td>
      <td><strong>${esc(u.firstName)} ${esc(u.lastName)}</strong><div class="muted">${esc(u.code)}</div></td>
      <td>${esc(u.email || '—')}</td>
      <td class="num">${u.visitsInPeriod}</td>
      <td class="num">${u.totalVisits}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Informe de período · ${esc(organization.name)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  :root {
    --primary: ${primary};
    --primary-light: ${primaryLight};
    --primary-100: ${primary100};
    --primary-900: ${primary900};
    --accent: ${accent};
    --on-primary: ${onPrimary};
    --on-accent: ${onAccent};
    --text: #1f2937;
    --text-muted: #6b7280;
    --border: #e5e7eb;
    --surface: #ffffff;
    --surface-alt: #f9fafb;
  }
  html, body { font-family: 'Inter', system-ui, sans-serif; color: var(--text); margin: 0; font-size: 11px; line-height: 1.45; }
  h1, h2, h3 { margin: 0; font-weight: 700; color: var(--text); }
  .muted { color: var(--text-muted); font-size: 9px; margin-top: 2px; }

  /* Cover */
  .cover {
    position: relative;
    padding: 32px;
    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-900) 100%);
    color: var(--on-primary);
    border-radius: 14px;
    overflow: hidden;
  }
  .cover::after {
    content: '';
    position: absolute; right: -80px; top: -80px;
    width: 320px; height: 320px;
    background: var(--accent); opacity: 0.18;
    border-radius: 50%;
  }
  .cover-head { display: flex; align-items: center; gap: 18px; position: relative; z-index: 1; }
  .cover-logo {
    width: 72px; height: 72px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .cover-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .cover-org { font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; opacity: 0.85; }
  .cover-title { font-size: 26px; font-weight: 800; line-height: 1.15; margin-top: 4px; }
  .cover-subtitle { margin-top: 18px; font-size: 12px; opacity: 0.9; position: relative; z-index: 1; }
  .cover-range { margin-top: 6px; font-size: 14px; font-weight: 700; position: relative; z-index: 1; }

  /* KPIs */
  .kpis {
    margin-top: 18px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .kpi {
    background: var(--primary-light);
    border-radius: 10px;
    padding: 14px 16px;
    border-left: 4px solid var(--primary);
  }
  .kpi.accent { border-left-color: var(--accent); }
  .kpi-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; }
  .kpi-value { font-size: 26px; font-weight: 800; color: var(--primary); line-height: 1; margin-top: 4px; }
  .kpi.accent .kpi-value { color: var(--accent); }
  .kpi-sub { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

  /* Sections */
  .section { margin-top: 22px; }
  .section h2 {
    font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;
    color: var(--primary); margin-bottom: 10px; padding-bottom: 6px;
    border-bottom: 2px solid var(--primary); display: inline-block;
  }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .card {
    background: var(--surface-alt); border-radius: 10px; padding: 14px 16px; border: 1px solid var(--border);
  }
  .card h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-muted); margin-bottom: 10px; }

  .bar-row {
    display: grid; grid-template-columns: 110px 1fr 44px; gap: 10px;
    align-items: center; margin-bottom: 6px; font-size: 10px;
  }
  .bar-track { height: 12px; background: #fff; border-radius: 6px; border: 1px solid var(--border); overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 6px; }
  .bar-label { font-weight: 600; }
  .bar-value { text-align: right; font-weight: 700; }

  /* Tables */
  table.report {
    width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 10px;
  }
  table.report thead th {
    background: var(--primary); color: var(--on-primary);
    text-align: left; padding: 8px 10px; font-weight: 700; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.3px;
  }
  table.report tbody td {
    padding: 7px 10px; border-bottom: 1px solid var(--border);
  }
  table.report .idx { color: var(--text-muted); text-align: center; width: 24px; }
  table.report .num { font-variant-numeric: tabular-nums; }

  .tag {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
  }
  .tag--ok { background: rgba(16,185,129,0.14); color: #047857; }
  .tag--danger { background: rgba(239,68,68,0.14); color: #b91c1c; }
  .tag--muted { background: #e5e7eb; color: #374151; }

  .page-break { page-break-before: always; }
  .footnote {
    margin-top: 18px; padding-top: 10px; border-top: 1px solid var(--border);
    font-size: 9px; color: var(--text-muted); font-style: italic;
  }
  .empty { text-align: center; padding: 24px; color: var(--text-muted); font-style: italic; }
</style>
</head>
<body>

<section class="cover">
  <div class="cover-head">
    ${logo ? `<div class="cover-logo"><img src="${logo}" alt="" /></div>` : ''}
    <div>
      <div class="cover-org">${esc(organization.name)}</div>
      <div class="cover-title">Informe de Período</div>
    </div>
  </div>
  <div class="cover-range">${esc(rangeLabel(period.range.from, period.range.to))}</div>
  <div class="cover-subtitle">Generado el ${esc(fmtDateTime(new Date()))}</div>
</section>

<section class="kpis">
  <div class="kpi"><div class="kpi-label">Actividades</div><div class="kpi-value">${period.summary.activitiesCount}</div><div class="kpi-sub">en el período</div></div>
  <div class="kpi accent"><div class="kpi-label">Asistencias</div><div class="kpi-value">${period.summary.attendancesCount}</div><div class="kpi-sub">total registradas</div></div>
  <div class="kpi"><div class="kpi-label">Visitantes únicos</div><div class="kpi-value">${period.summary.uniqueAttendees}</div><div class="kpi-sub">personas distintas</div></div>
  <div class="kpi"><div class="kpi-label">% Ocupación prom.</div><div class="kpi-value">${period.summary.avgOccupancy}%</div><div class="kpi-sub">de las plazas</div></div>
  <div class="kpi"><div class="kpi-label">Tipos cubiertos</div><div class="kpi-value">${period.summary.typesCount}</div><div class="kpi-sub">categorías</div></div>
  <div class="kpi"><div class="kpi-label">Meses con actividad</div><div class="kpi-value">${period.summary.monthsSpan}</div><div class="kpi-sub">en el rango</div></div>
</section>

${period.topActivities.length ? `
<section class="section">
  <h2>Top actividades</h2>
  <table class="report">
    <thead><tr><th>#</th><th>Actividad</th><th>Asistencias</th><th>% Ocup.</th></tr></thead>
    <tbody>${topActivitiesRows}</tbody>
  </table>
</section>` : ''}

<section class="section">
  <h2>Análisis</h2>
  <div class="grid-2">
    <div class="card">
      <h3>Distribución por tipo</h3>
      ${byTypeRows || '<div class="empty">Sin datos</div>'}
    </div>
    <div class="card">
      <h3>Evolución mes a mes</h3>
      ${byMonthRows || '<div class="empty">Sin datos</div>'}
    </div>
  </div>
</section>

<section class="section ${period.activities.length > 10 ? 'page-break' : ''}">
  <h2>Actividades del período (${period.activities.length})</h2>
  ${period.activities.length === 0 ? `<div class="empty">No hay actividades en este rango.</div>` : `
  <table class="report">
    <thead>
      <tr><th>#</th><th>Actividad</th><th>Tipo</th><th>Fecha</th><th>Asist.</th><th>% Ocup.</th><th>Estado</th></tr>
    </thead>
    <tbody>${activityRows}</tbody>
  </table>`}
</section>

${period.topUsers.length ? `
<section class="section page-break">
  <h2>Top visitantes (${period.topUsers.length})</h2>
  <table class="report">
    <thead><tr><th>#</th><th>Persona</th><th>Email</th><th>Visitas en período</th><th>Visitas totales</th></tr></thead>
    <tbody>${topUserRows}</tbody>
  </table>
</section>` : ''}

<div class="footnote">
  Informe generado automáticamente por ${esc(organization.name)} · contan2-saas.
  Los datos provienen del registro oficial de asistencia del kiosko y el scanner de staff.
</div>

</body>
</html>`;
}

export function periodPdfHeaderFooter({ organization, period }) {
  const orgName = esc(organization.name || 'contan2-saas');
  const range = esc(rangeLabel(period.range.from, period.range.to));
  return {
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:9px;color:#9ca3af;width:100%;padding:0 12mm;display:flex;justify-content:space-between;align-items:center;font-family:Inter,sans-serif;"><span>${orgName}</span><span>${range}</span></div>`,
    footerTemplate: `<div style="font-size:9px;color:#9ca3af;width:100%;padding:0 12mm;display:flex;justify-content:space-between;align-items:center;font-family:Inter,sans-serif;"><span>Informe de período</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
    margin: { top: '20mm', right: '12mm', bottom: '18mm', left: '12mm' },
  };
}

export function periodPdfFilename(from, to) {
  const f = new Date(from).toISOString().slice(0, 10);
  const t = new Date(new Date(to).getTime() - 86400000).toISOString().slice(0, 10);
  return f === t ? `Informe_periodo_${f}.pdf` : `Informe_periodo_${f}_a_${t}.pdf`;
}
