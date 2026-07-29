// apps/api-v2/src/services/reports/attendance-pdf-template.ts · PDF del
// reporte de asistencia por actividad / ciclo-categoría, en la MISMA tubería
// HTML→Chromium de los demás informes branded (reemplaza la tabla plana de
// PDFKit). Portada con identidad del tenant + KPIs + gráficos (personas por
// actividad, composición de check-ins, asistencia por fecha) + tabla detallada.
// Gráficos en HTML/SVG puros (sin JS): el render es determinístico.

import { generatePalette, pickOn } from '../branding-tokens.js';
import { loadLogoDataUri } from '../credential.js';
import type { AttendanceByActivityReport } from '../report-data.js';

export interface AttendancePdfOrg {
  name: string;
  slug: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  credentialLogoUrl: string | null;
}

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const num = (n: number): string => Math.round(n).toLocaleString('en-US');

const STATUS_LABELS: Record<string, string> = { activa: 'Activa', finalizada: 'Finalizada', cancelada: 'Cancelada', borrador: 'Borrador' };
const STATUS_CLS: Record<string, string> = { activa: 'ok', finalizada: 'muted', cancelada: 'danger', borrador: 'muted' };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
}
function fmtNow(): string {
  return new Date().toLocaleString('es-DO', { dateStyle: 'long', timeStyle: 'short' });
}

// Donut SVG estático (misma geometría que los dashboards web: r=15.91549).
function donutSvg(slices: Array<{ label: string; count: number; color: string }>, centerValue: number, centerLabel: string): string {
  const sum = slices.reduce((a, s) => a + s.count, 0) || 1;
  let cum = 0;
  const arcs = slices.map((s) => {
    const pc = (s.count / sum) * 100;
    const arc = `<circle cx="21" cy="21" r="15.91549" fill="none" stroke="${s.color}" stroke-width="6"
      stroke-dasharray="${pc.toFixed(3)} ${(100 - pc).toFixed(3)}" stroke-dashoffset="${(25 - cum).toFixed(3)}" />`;
    cum += pc;
    return arc;
  }).join('');
  const legend = slices.map((s) => {
    const pc = Math.round((s.count / sum) * 100);
    return `<div class="legend-row"><span class="legend-dot" style="background:${s.color}"></span>
      <span class="legend-label">${esc(s.label)}</span><span class="legend-val">${num(s.count)}</span><span class="legend-pc">(${pc}%)</span></div>`;
  }).join('');
  return `
    <div class="donut-wrap">
      <div class="donut">
        <svg viewBox="0 0 42 42">
          <circle cx="21" cy="21" r="15.91549" fill="none" stroke="#eef0f4" stroke-width="6" />
          ${arcs}
        </svg>
        <div class="donut-center"><div class="donut-value">${num(centerValue)}</div><div class="donut-label">${esc(centerLabel)}</div></div>
      </div>
      <div class="legend">${legend}</div>
    </div>`;
}

export async function buildAttendancePdfHtml({ organization, report, category }: {
  organization: AttendancePdfOrg;
  report: AttendanceByActivityReport;
  category: string | null;
}): Promise<string> {
  const palette = (generatePalette(organization.primaryColor || '#e65100') ?? {}) as Record<string, string>;
  const primary = palette['700'] || organization.primaryColor || '#e65100';
  const primaryLight = palette['50'] || '#fdf2e5';
  const primary900 = palette['900'] || '#7a2e00';
  const accent = organization.secondaryColor || '#ff6f00';
  // Color estructural: azul profundo de identidad para el CCB (ver
  // period-pdf-template), primary derivado para el resto.
  const structural = organization.slug === 'ccb' ? '#1a6194' : primary;
  const onStructural = pickOn(structural);
  const headerA = organization.primaryColor || primary;
  const headerB = palette['800'] || primary900;
  const logo = await loadLogoDataUri(organization.credentialLogoUrl || organization.logoUrl);

  const t = report.totals;
  const rows = report.rows;

  // Personas por actividad (top 12, orden desc) — barras horizontales.
  const byPeople = [...rows].sort((a, b) => b.people - a.people).slice(0, 12);
  const maxPeople = Math.max(1, ...byPeople.map((r) => r.people));
  const peopleBars = byPeople.map((r) => `
    <div class="bar-row">
      <span class="bar-label"><strong>${esc(r.name)}</strong><span class="bar-sub">${esc(fmtDate(r.date))}</span></span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round((r.people / maxPeople) * 100)}%; background:${structural}"></span></span>
      <span class="bar-value">${num(r.people)}</span>
    </div>`).join('');

  // Asistencia por fecha (personas por día de función) — barras verticales.
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const k = r.date.slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + r.people);
  }
  const dayEntries = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxDay = Math.max(1, ...dayEntries.map(([, n]) => n));
  const dayCols = dayEntries.map(([d, n]) => `
    <div class="vcol">
      <div class="vcol-value">${num(n)}</div>
      <div class="vcol-bar" style="height:${Math.max(3, Math.round((n / maxDay) * 100))}%; background:${accent}"></div>
      <div class="vcol-label">${esc(fmtDay(d))}</div>
    </div>`).join('');

  // Composición de check-ins: con credencial vs anónimos.
  const identified = Math.max(0, t.attendances - t.anonymous);
  const donut = donutSvg(
    [
      { label: 'Con credencial', count: identified, color: structural },
      { label: 'Anónimos', count: t.anonymous, color: accent },
    ],
    t.attendances, 'check-ins',
  );

  const tableRows = rows.map((r, i) => `
    <tr>
      <td class="idx">${i + 1}</td>
      <td><strong>${esc(r.name)}</strong></td>
      <td class="num">${esc(fmtDate(r.date))}</td>
      <td>${esc(r.location)}</td>
      <td><span class="tag tag--${STATUS_CLS[r.status] ?? 'muted'}">${esc(STATUS_LABELS[r.status] ?? r.status)}</span></td>
      <td class="num">${num(r.capacity)}</td>
      <td class="num">${num(r.enrolledCount)}</td>
      <td class="num">${num(r.attendances)}</td>
      <td class="num"><strong>${num(r.people)}</strong></td>
      <td class="num">${num(r.anonymous)}</td>
      <td class="num">${r.occupancyPct}%</td>
    </tr>`).join('');

  const title = category ? esc(category) : 'Asistencia por actividad';
  const eyebrow = category ? 'Reporte de ciclo · categoría' : 'Reporte de asistencia';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${title} · ${esc(organization.name)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  :root { --structural: ${structural}; --accent: ${accent}; --primary-light: ${primaryLight};
    --text: #1f2937; --muted: #6b7280; --border: #e5e7eb; --surface-alt: #f9fafb; }
  html, body { font-family: 'Inter', system-ui, sans-serif; color: var(--text); margin: 0; }
  body { font-size: 11px; line-height: 1.45; }
  h1, h2 { margin: 0; }

  .cover { position: relative; padding: 26px 30px 22px; border-radius: 14px; overflow: hidden;
    background: linear-gradient(135deg, ${headerA} 0%, ${headerB} 100%); color: #fff; }
  .cover::after { content: ''; position: absolute; right: -80px; top: -90px; width: 300px; height: 300px;
    background: #fff; opacity: 0.10; border-radius: 50%; }
  .cover-head { display: flex; align-items: center; gap: 16px; position: relative; z-index: 1; }
  .cover-logo { width: 76px; height: 56px; background: #fff; border-radius: 10px; padding: 7px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .cover-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .cover-org { font-size: 10.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; opacity: 0.9; }
  .cover-eyebrow { margin-top: 8px; font-size: 9.5px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; opacity: 0.8; }
  .cover-title { font-size: 24px; font-weight: 800; line-height: 1.15; margin-top: 2px; }
  .cover-meta { margin-top: 12px; font-size: 11px; opacity: 0.92; position: relative; z-index: 1; }

  .kpis { margin-top: 16px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .kpi { background: var(--primary-light); border-radius: 10px; padding: 12px 14px; }
  .kpi-label { font-size: 9.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; }
  .kpi-value { font-size: 24px; font-weight: 800; color: var(--structural); line-height: 1.05; margin-top: 3px; }
  .kpi.accent .kpi-value { color: var(--accent); }
  .kpi-sub { font-size: 9.5px; color: var(--muted); margin-top: 2px; }

  .section { margin-top: 20px; }
  .section h2 { font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;
    color: var(--structural); margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid var(--structural); display: inline-block; }

  .analysis-grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 14px; align-items: start; }
  .analysis-card { background: var(--surface-alt); border-radius: 10px; padding: 13px 15px; border: 1px solid var(--border); }
  .analysis-card h3 { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted); margin: 0 0 10px; }

  .bar-row { display: grid; grid-template-columns: 185px 1fr 40px; gap: 9px; align-items: center; margin-bottom: 6px; font-size: 9.5px; }
  .bar-row:last-child { margin-bottom: 0; }
  .bar-label { color: var(--text); line-height: 1.2; }
  .bar-label strong { display: block; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-sub { color: var(--muted); font-size: 8.5px; }
  .bar-track { height: 11px; background: #fff; border-radius: 6px; border: 1px solid var(--border); overflow: hidden; }
  .bar-fill { display: block; height: 100%; border-radius: 6px; }
  .bar-value { text-align: right; font-weight: 700; }

  .donut-wrap { display: flex; align-items: center; gap: 14px; }
  .donut { position: relative; width: 116px; height: 116px; flex-shrink: 0; }
  .donut svg { width: 100%; height: 100%; }
  .donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .donut-value { font-size: 19px; font-weight: 800; color: var(--text); line-height: 1; }
  .donut-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted); margin-top: 2px; }
  .legend { flex: 1; }
  .legend-row { display: flex; align-items: center; gap: 7px; font-size: 10px; padding: 3px 0; }
  .legend-dot { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
  .legend-label { flex: 1; }
  .legend-val { font-weight: 700; }
  .legend-pc { color: var(--muted); }

  .vchart { display: flex; align-items: flex-end; gap: 6px; height: 110px; padding-top: 4px; }
  .vcol { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .vcol-value { font-size: 8.5px; font-weight: 700; color: var(--muted); margin-bottom: 2px; }
  .vcol-bar { width: 100%; max-width: 26px; border-radius: 4px 4px 0 0; }
  .vcol-label { font-size: 8px; color: var(--muted); margin-top: 3px; white-space: nowrap; }

  table.detail { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9.5px; }
  table.detail thead th { background: var(--structural); color: ${onStructural}; text-align: left; padding: 7px 8px;
    font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
  table.detail thead th.num { text-align: right; }
  table.detail thead th:first-child { border-radius: 6px 0 0 0; }
  table.detail thead th:last-child { border-radius: 0 6px 0 0; }
  table.detail tbody td { padding: 6px 8px; border-bottom: 1px solid var(--border); }
  table.detail td.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.detail .idx { color: var(--muted); text-align: center; width: 22px; }
  table.detail tfoot td { padding: 7px 8px; background: var(--primary-light); font-weight: 800; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 8.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; }
  .tag--ok { background: rgba(16,185,129,0.14); color: #047857; }
  .tag--muted { background: #e5e7eb; color: #374151; }
  .tag--danger { background: rgba(239,68,68,0.14); color: #b91c1c; }

  .empty { text-align: center; padding: 22px; color: var(--muted); font-style: italic; }
  .footnote { margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 9px; color: var(--muted); font-style: italic; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>

<section class="cover">
  <div class="cover-head">
    ${logo ? `<div class="cover-logo"><img src="${logo}" alt="" /></div>` : ''}
    <div>
      <div class="cover-org">${esc(organization.name)}</div>
      <div class="cover-eyebrow">${eyebrow}</div>
      <h1 class="cover-title">${title}</h1>
    </div>
  </div>
  <div class="cover-meta">Período: ${esc(report.period.from)} a ${esc(report.period.to)} · Generado el ${esc(fmtNow())}</div>
</section>

<section class="kpis">
  <div class="kpi"><div class="kpi-label">Actividades</div><div class="kpi-value">${num(t.activities)}</div><div class="kpi-sub">en el período</div></div>
  <div class="kpi"><div class="kpi-label">Check-ins</div><div class="kpi-value">${num(t.attendances)}</div><div class="kpi-sub">${num(t.anonymous)} anónimos</div></div>
  <div class="kpi accent"><div class="kpi-label">Personas</div><div class="kpi-value">${num(t.people)}</div><div class="kpi-sub">con acompañantes</div></div>
  <div class="kpi"><div class="kpi-label">Ocupación</div><div class="kpi-value">${t.occupancyPct}%</div><div class="kpi-sub">capacidad ${num(t.capacity)}</div></div>
</section>

${rows.length === 0 ? '<div class="empty">No hay actividades en el período seleccionado.</div>' : `
<section class="section">
  <h2>Análisis</h2>
  <div class="analysis-grid">
    <div class="analysis-card">
      <h3>Personas por actividad${rows.length > 12 ? ' (top 12)' : ''}</h3>
      ${peopleBars}
    </div>
    <div class="analysis-card">
      <h3>Composición de check-ins</h3>
      ${t.attendances === 0 ? '<div class="empty">Sin check-ins registrados.</div>' : donut}
    </div>
  </div>
  ${dayEntries.length > 1 && dayEntries.length <= 24 ? `
  <div class="analysis-card" style="margin-top:14px;">
    <h3>Personas por fecha de función</h3>
    <div class="vchart">${dayCols}</div>
  </div>` : ''}
</section>

<section class="section ${rows.length > 6 ? 'page-break' : ''}">
  <h2>Detalle por actividad (${num(rows.length)})</h2>
  <table class="detail">
    <thead>
      <tr>
        <th>#</th><th>Actividad</th><th class="num">Fecha</th><th>Lugar</th><th>Estado</th>
        <th class="num">Cap.</th><th class="num">Inscr.</th><th class="num">Check-ins</th>
        <th class="num">Personas</th><th class="num">Anón.</th><th class="num">Ocup. %</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="5">TOTAL</td>
        <td class="num">${num(t.capacity)}</td><td class="num"></td><td class="num">${num(t.attendances)}</td>
        <td class="num">${num(t.people)}</td><td class="num">${num(t.anonymous)}</td><td class="num">${t.occupancyPct}%</td>
      </tr>
    </tfoot>
  </table>
</section>`}

<div class="footnote">
  Informe generado automáticamente por ${esc(organization.name)} · Los datos provienen del registro oficial de asistencia (kiosko, scanner y consola de check-in). "Personas" incluye acompañantes.
</div>

</body>
</html>`;
}

export function attendancePdfHeaderFooter({ organization, category }: { organization: AttendancePdfOrg; category: string | null }) {
  const orgName = esc(organization.name || 'contan2-saas');
  const docName = esc(category || 'Asistencia por actividad');
  return {
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size:9px; color:#9ca3af; width:100%; padding: 0 12mm; display:flex; justify-content:space-between; align-items:center; font-family:Inter,sans-serif;">
        <span>${orgName}</span><span>${docName}</span>
      </div>`,
    footerTemplate: `
      <div style="font-size:9px; color:#9ca3af; width:100%; padding: 0 12mm; display:flex; justify-content:space-between; align-items:center; font-family:Inter,sans-serif;">
        <span>Reporte de asistencia</span>
        <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>`,
    margin: { top: '18mm', right: '12mm', bottom: '16mm', left: '12mm' },
  };
}
