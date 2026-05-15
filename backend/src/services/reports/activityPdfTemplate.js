// =============================================================================
// activityPdfTemplate.js · plantilla HTML del informe PDF por actividad.
// Reusa los tokens de marca (generatePalette / pickOn) y embebe el logo
// como data URI para que el PDF sea self-contained.
// =============================================================================

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { generatePalette, pickOn } from '../../utils/palette.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'data', 'uploads');

const TYPE_LABELS = {
  exposicion: 'Exposición', concierto: 'Concierto', cine: 'Cine', taller: 'Taller',
  teatro: 'Teatro', conferencia: 'Conferencia', otro: 'Otro',
};
const STATUS_LABELS = {
  activa: 'Activa', finalizada: 'Finalizada', cancelada: 'Cancelada', borrador: 'Borrador',
};

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}
function fmtNow() {
  return new Date().toLocaleString('es-DO', { dateStyle: 'long', timeStyle: 'short' });
}

async function logoDataUri(logoUrl) {
  if (!logoUrl || !logoUrl.startsWith('/uploads/')) return null;
  const filename = path.basename(logoUrl);
  const filePath = path.join(UPLOADS_DIR, filename);
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase().replace('.', '') || 'jpeg';
    const mime = ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'gif' ? 'image/gif'
      : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function categoryFor(prior) {
  const n = Number(prior) || 0;
  if (n === 0) return 'Primera visita';
  if (n >= 10) return 'VIP';
  return 'Recurrente';
}

export async function buildActivityPdfHtml({ organization, activity, attendances, users, affinities }) {
  const palette = generatePalette(organization.primaryColor || '#1a237e') || {};
  const primary = palette['700'] || organization.primaryColor || '#1a237e';
  const primaryLight = palette['50'] || '#eeeffc';
  const primary100 = palette['100'] || '#d5d8f6';
  const primary900 = palette['900'] || '#0d144f';
  const accent = organization.secondaryColor || '#ff6f00';
  const accentLight = '#fff4e6';
  const onPrimary = pickOn(primary);
  const onAccent = pickOn(accent);
  const logo = await logoDataUri(organization.logoUrl);

  const total = attendances.length;
  const newcomers = affinities.filter(a => (a?.totalAttendances ?? 0) === 1).length;
  const returning = total - newcomers;
  const vip = affinities.filter(a => (a?.totalAttendances ?? 0) >= 10).length;
  const showUpPct = activity.capacity ? Math.round((total / activity.capacity) * 100) : 0;

  // Histograma por hora
  const byHour = new Map();
  for (const att of attendances) {
    const iso = att.checkedInAt || att.registeredAt;
    if (!iso) continue;
    const d = new Date(iso);
    if (isNaN(d.getTime())) continue;
    byHour.set(d.getHours(), (byHour.get(d.getHours()) || 0) + 1);
  }
  const hourEntries = [...byHour.entries()].sort((a, b) => a[0] - b[0]);
  const maxHour = hourEntries.length ? Math.max(...hourEntries.map(([, c]) => c)) : 0;

  // Filas de asistentes
  const rows = attendances.map((att, i) => {
    const u = users.find(x => x.id === att.userId);
    const prior = Math.max(0, (affinities[i]?.totalAttendances ?? 0) - 1);
    const cat = categoryFor(prior);
    const rowCls = cat === 'Primera visita' ? 'newcomer'
      : cat === 'VIP' ? 'vip' : '';
    return `
      <tr class="${rowCls}">
        <td class="idx">${i + 1}</td>
        <td class="code">${esc(u?.code || att.userCode || '—')}</td>
        <td>${esc(u?.firstName || '—')} ${esc(u?.lastName || '')}</td>
        <td>${esc(u?.email || '—')}</td>
        <td>${esc(u?.phone || '—')}</td>
        <td class="num">${esc(fmtTime(att.checkedInAt || att.registeredAt))}</td>
        <td class="num">${prior}</td>
        <td><span class="tag tag--${cat === 'Primera visita' ? 'new' : cat === 'VIP' ? 'vip' : 'reg'}">${cat}</span></td>
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
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  :root {
    --primary: ${primary};
    --primary-light: ${primaryLight};
    --primary-100: ${primary100};
    --primary-900: ${primary900};
    --accent: ${accent};
    --accent-light: ${accentLight};
    --on-primary: ${onPrimary};
    --on-accent: ${onAccent};
    --text: #1f2937;
    --text-muted: #6b7280;
    --border: #e5e7eb;
    --surface: #ffffff;
    --surface-alt: #f9fafb;
  }
  html, body { font-family: 'Inter', system-ui, sans-serif; color: var(--text); margin: 0; }
  body { font-size: 11px; line-height: 1.45; }
  h1, h2, h3 { margin: 0; font-weight: 700; color: var(--text); }
  .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: var(--text-muted); }

  /* === Cover === */
  .cover {
    position: relative;
    padding: 32px 32px 24px;
    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-900) 100%);
    color: var(--on-primary);
    border-radius: 14px;
    overflow: hidden;
  }
  .cover::after {
    content: '';
    position: absolute;
    right: -80px; top: -80px;
    width: 320px; height: 320px;
    background: var(--accent);
    opacity: 0.18;
    border-radius: 50%;
    filter: blur(0.5px);
  }
  .cover-head {
    display: flex; align-items: center; gap: 18px;
    position: relative; z-index: 1;
  }
  .cover-logo {
    width: 64px; height: 64px;
    background: #fff;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    padding: 6px;
    flex-shrink: 0;
  }
  .cover-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .cover-org { font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; opacity: 0.85; }
  .cover-title { font-size: 26px; font-weight: 800; line-height: 1.15; margin-top: 4px; }
  .cover-subtitle { margin-top: 18px; font-size: 12px; opacity: 0.9; position: relative; z-index: 1; }

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

  /* === KPIs === */
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

  /* === Section heads === */
  .section { margin-top: 22px; }
  .section h2 {
    font-size: 13px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--primary);
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 2px solid var(--primary);
    display: inline-block;
  }

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
  .tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    white-space: nowrap;
  }
  .tag--new { background: var(--accent); color: var(--on-accent); }
  .tag--vip { background: var(--primary); color: var(--on-primary); }
  .tag--reg { background: #e5e7eb; color: #374151; }

  /* Page break antes de tabla larga */
  .page-break { page-break-before: always; }

  /* Footer (Puppeteer header/footer template usa otro mecanismo, este es solo
     para impresión web). */
  .footnote {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font-size: 9px;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Empty state */
  .empty {
    text-align: center;
    padding: 24px;
    color: var(--text-muted);
    font-style: italic;
  }
</style>
</head>
<body>

<section class="cover">
  <div class="cover-head">
    ${logo ? `<div class="cover-logo"><img src="${logo}" alt="" /></div>` : ''}
    <div>
      <div class="cover-org">${esc(organization.name)}</div>
      <div class="cover-title">Informe de Asistencia</div>
    </div>
  </div>
  <div class="cover-subtitle">Generado el ${esc(fmtNow())}</div>
</section>

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
    <div class="kpi-sub">capacidad ${activity.capacity}</div>
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
  ${total === 0 ? `<div class="empty">No hay asistencias registradas todavía para esta actividad.</div>` : `
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
        <th>Categoría</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`}
</section>

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
  const stamp = isNaN(d.getTime()) ? '' : `_${d.toISOString().slice(0, 10)}`;
  return `Informe_${base}${stamp}.pdf`;
}
