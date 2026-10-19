// PORT VERBATIM de v1 (backend/src/services/reports/activityPdfTemplate.js) · 2026-06-11.
// Plantilla PURA probada en producción v1; el tipado estricto queda como pase
// posterior (los tests de integración la ejercitan end-to-end: el Excel se
// re-parsea con exceljs y el HTML se valida). Cambios respecto a v1: imports
// de palette → branding-tokens, y el logo llega por loadLogoDataUri (URL,
// con rasterizado de SVG) en lugar de leerse del filesystem.
// @ts-nocheck
/* eslint-disable */
// =============================================================================
// activityPdfTemplate.js · plantilla HTML del informe PDF por actividad.
// Reusa los tokens de marca (generatePalette / pickOn) y embebe el logo
// como data URI para que el PDF sea self-contained.
// =============================================================================

import { esc, pdfCover, pdfShellCss, pdfTheme } from './pdf-shell.js';
import { loadLogoDataUri } from '../credential.js';
import { fmtDateTz, fmtTimeTz, fmtNowTz, hourInTz, ymdInTz } from './fmt.js';
import { occupancyPct, peopleOf } from './metrics.js';


const TYPE_LABELS = {
  exposicion: 'Exposición', concierto: 'Concierto', cine: 'Cine', taller: 'Taller',
  teatro: 'Teatro', conferencia: 'Conferencia',
  tertulia: 'Tertulia', visita_guiada: 'Visita guiada', cuentacuentos: 'Cuenta cuentos',
  otro: 'Otro',
};
const STATUS_LABELS = {
  activa: 'Activa', finalizada: 'Finalizada', cancelada: 'Cancelada', borrador: 'Borrador',
};


function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const date = fmtDateTz(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = fmtTimeTz(d);
  return `${date} · ${time}`;
}
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return fmtTimeTz(d);
}
function fmtNow() {
  return fmtNowTz();
}


function categoryFor(prior) {
  const n = Number(prior) || 0;
  if (n === 0) return 'Primera visita';
  if (n >= 10) return 'VIP';
  return 'Recurrente';
}

export async function buildActivityPdfHtml({ organization, activity, attendances, users, affinities, protocol }) {
  const theme = pdfTheme(organization);
  const { primary, primary900, accent } = theme;
  const accentLight = '#fff4e6';
  const logo = await loadLogoDataUri(organization.credentialLogoUrl || organization.logoUrl);

  // Asistencia = check-in real (checkedInAt). Las filas sin checkedInAt son
  // RESERVAS (holds de protocolo/RSVP): se listan con Estado "Reservado" y no
  // entran a los KPIs. `affinities` va alineada por índice con `attendances`.
  const isSeated = a => !!a.checkedInAt;
  const seatedIdx = [];
  attendances.forEach((a, i) => { if (isSeated(a)) seatedIdx.push(i); });
  const total = seatedIdx.length;
  const heldCount = attendances.length - total;
  const peopleInRoom = seatedIdx.reduce((n, i) => n + peopleOf(attendances[i]), 0);
  const newcomers = seatedIdx.filter(i => (affinities[i]?.totalAttendances ?? 0) === 1).length;
  const returning = total - newcomers;
  const vip = seatedIdx.filter(i => (affinities[i]?.totalAttendances ?? 0) >= 10).length;
  const showUpPct = occupancyPct(peopleInRoom, activity.capacity);

  // Histograma por hora
  const byHour = new Map();
  for (const att of attendances) {
    if (!isSeated(att)) continue; // las reservas no hicieron check-in
    const iso = att.checkedInAt;
    const d = new Date(iso);
    if (isNaN(d.getTime())) continue;
    const h = hourInTz(d);
    byHour.set(h, (byHour.get(h) || 0) + 1);
  }
  const hourEntries = [...byHour.entries()].sort((a, b) => a[0] - b[0]);
  const maxHour = hourEntries.length ? Math.max(...hourEntries.map(([, c]) => c)) : 0;

  // Filas de asistentes
  const rows = attendances.map((att, i) => {
    const u = users.find(x => x.id === att.userId);
    const prior = Math.max(0, (affinities[i]?.totalAttendances ?? 0) - 1);
    const seated = isSeated(att);
    const cat = seated ? categoryFor(prior) : '—';
    const rowCls = !seated ? 'held' : cat === 'Primera visita' ? 'newcomer'
      : cat === 'VIP' ? 'vip' : '';
    return `
      <tr class="${rowCls}">
        <td class="idx">${i + 1}</td>
        <td class="code">${esc(u?.code || att.userCode || '—')}</td>
        <td>${esc(u?.firstName || '—')} ${esc(u?.lastName || '')}</td>
        <td>${esc(u?.email || '—')}</td>
        <td>${esc(u?.phone || '—')}</td>
        <td class="num">${seated ? esc(fmtTime(att.checkedInAt)) : '—'}</td>
        <td class="num">${prior}</td>
        <td>${seated ? 'Asistió' : 'Reservado'}</td>
        <td><span class="tag tag--${!seated ? 'reg' : cat === 'Primera visita' ? 'new' : cat === 'VIP' ? 'vip' : 'reg'}">${cat}</span></td>
      </tr>`;
  }).join('');

  const distRows = [
    { label: 'Primera visita', count: newcomers, color: accent },
    { label: 'Recurrentes', count: Math.max(0, returning - vip), color: primary },
    { label: 'VIP (10+ visitas)', count: vip, color: primary900 },
  ];
  const distMax = Math.max(1, ...distRows.map(d => d.count));

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Informe de asistencia · ${esc(activity.name)}</title>
<style>
${pdfShellCss(theme)}
  .kpis { grid-template-columns: repeat(4, 1fr); }
  .kpi { padding: 13px 14px 12px; }
  .kpi-value { font-size: 24px; }
  /* === Activity card === */
  .activity-card {
    margin-top: 18px;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px 22px;
    background: var(--surface);
  }
  .activity-card-head {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 18px;
    padding-bottom: 12px; border-bottom: 1px solid var(--border);
  }
  .activity-name { font-size: 18px; font-weight: 700; color: var(--text); line-height: 1.2; }
  .activity-type {
    display: inline-block;
    margin-top: 6px;
    padding: 3px 10px;
    background: var(--primary-light);
    color: var(--primary);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .activity-status {
    padding: 5px 12px;
    background: rgba(16, 185, 129, 0.14);
    color: #047857;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .activity-status.cancelada { background: rgba(239, 68, 68, 0.14); color: #b91c1c; }
  .activity-status.finalizada { background: rgba(107, 114, 128, 0.14); color: #374151; }
  .activity-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 24px;
    margin-top: 12px;
  }
  .activity-meta dt { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; }
  .activity-meta dd { font-size: 12px; font-weight: 600; margin: 1px 0 0; }

  /* === Análisis === */
  .analysis-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .analysis-card {
    background: var(--surface-alt);
    border-radius: 10px;
    padding: 14px 16px;
    border: 1px solid var(--border);
  }
  .analysis-card h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-muted); margin-bottom: 10px; }
  .bar-row {
    display: grid;
    grid-template-columns: 90px 1fr 44px;
    gap: 10px;
    align-items: center;
    margin-bottom: 6px;
    font-size: 10px;
  }
  .bar-row:last-child { margin-bottom: 0; }
  .bar-label { color: var(--text); font-weight: 600; }
  .bar-track { height: 12px; background: #fff; border-radius: 6px; border: 1px solid var(--border); overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 6px; }
  .bar-value { text-align: right; font-weight: 700; color: var(--text); }
  .hour-row { grid-template-columns: 80px 1fr 30px; }

  /* === Tabla asistentes === */
  table.attendees {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
    font-size: 10px;
  }
  table.attendees thead th {
    background: var(--primary);
    color: var(--on-primary);
    text-align: left;
    padding: 8px 10px;
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  table.attendees thead th:first-child { border-radius: 6px 0 0 0; }
  table.attendees thead th:last-child { border-radius: 0 6px 0 0; }
  table.attendees tbody td {
    padding: 7px 10px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
  }
  table.attendees tbody tr.newcomer td { background: ${accentLight}; }
  table.attendees tbody tr.vip td { background: var(--primary-light); }
  table.attendees .idx { color: var(--text-muted); text-align: center; width: 24px; }
  table.attendees .code { font-family: ui-monospace, Menlo, monospace; font-weight: 700; }
  table.attendees .num { font-variant-numeric: tabular-nums; }
  .tag--new { background: var(--accent); color: var(--on-accent); }
  .tag--vip { background: var(--primary); color: var(--on-primary); }
  tr.held td { color: var(--text-muted); font-style: italic; }
  .tag--reg { background: #e5e7eb; color: #374151; }

</style>
</head>
<body>

${pdfCover({ logo, orgName: organization.name, title: 'Informe de Asistencia', eyebrow: esc(activity.name), range: fmtDate(activity.date), subtitle: `Generado el ${fmtNow()}` })}

<section class="activity-card">
  <div class="activity-card-head">
    <div>
      <div class="activity-name">${esc(activity.name)}</div>
      <span class="activity-type">${esc(TYPE_LABELS[activity.type] || activity.type || '—')}</span>
    </div>
    <span class="activity-status ${esc(activity.status || '')}">${esc(STATUS_LABELS[activity.status] || activity.status || '—')}</span>
  </div>
  <dl class="activity-meta">
    <div><dt>Fecha</dt><dd>${esc(fmtDate(activity.date))}</dd></div>
    <div><dt>Ubicación</dt><dd>${esc(activity.location || '—')}</dd></div>
    <div><dt>Cupo</dt><dd>${activity.enrolledCount} / ${activity.capacity}</dd></div>
    <div><dt>Asistencias confirmadas</dt><dd>${total}</dd></div>
  </dl>
</section>

<section class="kpis">
  <div class="kpi accent">
    <div class="kpi-label">Asistencias</div>
    <div class="kpi-value">${total}</div>
    <div class="kpi-sub">de ${activity.enrolledCount} inscritos</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">% Ocupación</div>
    <div class="kpi-value">${showUpPct}%</div>
    <div class="kpi-sub">${peopleInRoom} en sala · capacidad ${activity.capacity}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Reservados (en lista)</div>
    <div class="kpi-value">${heldCount}</div>
    <div class="kpi-sub">sin check-in</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Primera visita</div>
    <div class="kpi-value">${newcomers}</div>
    <div class="kpi-sub">nuevos para el centro</div>
  </div>
</section>

<section class="section">
  <h2>Análisis</h2>
  <div class="analysis-grid">
    <div class="analysis-card">
      <h3>Distribución de asistentes</h3>
      ${distRows.map(d => `
        <div class="bar-row">
          <span class="bar-label">${esc(d.label)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.round((d.count / distMax) * 100)}%; background:${d.color}"></span></span>
          <span class="bar-value">${d.count}</span>
        </div>`).join('')}
    </div>
    <div class="analysis-card">
      <h3>Check-ins por hora</h3>
      ${hourEntries.length === 0
        ? `<div class="empty">Sin check-ins registrados</div>`
        : hourEntries.map(([h, c]) => `
          <div class="bar-row hour-row">
            <span class="bar-label">${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00</span>
            <span class="bar-track"><span class="bar-fill" style="width:${Math.round((c / maxHour) * 100)}%; background:var(--primary)"></span></span>
            <span class="bar-value">${c}</span>
          </div>`).join('')}
    </div>
  </div>
</section>

<section class="section ${total > 8 ? 'page-break' : ''}">
  <h2>Asistentes (${total})</h2>
  ${attendances.length === 0 ? `<div class="empty">No hay asistencias registradas todavía para esta actividad.</div>` : `
  <table class="attendees">
    <thead>
      <tr>
        <th>#</th>
        <th>Código</th>
        <th>Nombre completo</th>
        <th>Email</th>
        <th>Teléfono</th>
        <th>Hora</th>
        <th>Asist. previas</th>
        <th>Estado</th>
        <th>Categoría</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`}
</section>

${protocol && protocol.rows && protocol.rows.length > 0 ? `
<section class="section">
  <h2>Protocolo (${protocol.summary.invited})</h2>
  <p style="margin:0 0 8px;font-size:10px;color:#6b7280;">
    Confirmados: ${protocol.summary.confirmed} (${protocol.summary.totalParty} personas con acompañantes) · Asistieron: ${protocol.summary.attended}
  </p>
  <table class="attendees">
    <thead>
      <tr><th>#</th><th>Invitado</th><th>Categoría</th><th>Estado</th><th>Acomp.</th><th>Asistió</th></tr>
    </thead>
    <tbody>${protocol.rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(r.name)}</td>
        <td>${esc({ autoridad: 'Autoridad', diplomatico: 'Diplomático', prensa: 'Prensa', patrocinador: 'Patrocinador', directivo: 'Directivo', artista: 'Artista', otro: 'Otro' }[r.category] || r.category)}</td>
        <td>${esc({ pending: 'Sin responder', confirmed: 'Confirmada', declined: 'No puede', expired: 'Expirada', canceled: 'Cancelada' }[r.status] || r.status)}</td>
        <td>${r.plusOnes > 0 ? `+${r.plusOnes}` : '—'}</td>
        <td>${r.attended ? 'Sí' : '—'}</td>
      </tr>`).join('')}</tbody>
  </table>
</section>` : ''}

<div class="footnote">
  Informe generado automáticamente por ${esc(organization.name)} · contan2-saas. Los datos provienen del registro oficial de asistencia del kiosko y el scanner de staff.
</div>

</body>
</html>`;
}

// Header y footer separados (Puppeteer.pdf espera HTML mínimo con clases
// reservadas: .pageNumber, .totalPages, .date, .title, .url).
export function pdfHeaderFooter({ organization, activity }) {
  const orgName = esc(organization.name || 'contan2-saas');
  const actName = esc(activity.name || 'Informe');
  return {
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size:9px; color:#9ca3af; width:100%; padding: 0 12mm; display:flex; justify-content:space-between; align-items:center; font-family:Inter,sans-serif;">
        <span>${orgName}</span>
        <span>${actName}</span>
      </div>`,
    footerTemplate: `
      <div style="font-size:9px; color:#9ca3af; width:100%; padding: 0 12mm; display:flex; justify-content:space-between; align-items:center; font-family:Inter,sans-serif;">
        <span>Informe de asistencia</span>
        <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>`,
    margin: { top: '20mm', right: '12mm', bottom: '18mm', left: '12mm' },
  };
}

export function pdfFilename(activity) {
  const base = (activity.name || 'actividad')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  const d = activity.date ? new Date(activity.date) : new Date();
  const stamp = isNaN(d.getTime()) ? '' : `_${ymdInTz(d)}`;
  return `Informe_${base}${stamp}.pdf`;
}
