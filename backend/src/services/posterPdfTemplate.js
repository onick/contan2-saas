// =============================================================================
// posterPdfTemplate.js · póster A4 imprimible con QR de actividad + branding
// del tenant. Generado vía Puppeteer reutilizando renderHtmlToPdf.
// =============================================================================

import { generatePalette, pickOn } from '../utils/palette.js';
import { loadOrgLogoDataUri } from './emailBranding.js';
import { buildKioskoUrl } from './activityQR.js';

const TYPE_LABELS = {
  exposicion: 'Exposición',
  concierto: 'Concierto',
  cine: 'Cine',
  taller: 'Taller',
  teatro: 'Teatro',
  conferencia: 'Conferencia',
  otro: 'Evento',
};

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function fmtDateLong(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
  return `${date.charAt(0).toUpperCase()}${date.slice(1)} · ${time}`;
}

function shortUrl(full) {
  // Devuelve la URL legible para imprimir debajo del QR.
  try { return full.replace(/^https?:\/\//, ''); } catch { return full; }
}

export async function buildActivityPosterHtml({ organization, activity, qrDataUri }) {
  const palette = generatePalette(organization?.primaryColor || '#1a237e') || {};
  const primary = palette['700'] || '#1a237e';
  const primary50 = palette['50'] || '#eeeffc';
  const primary100 = palette['100'] || '#d5d8f6';
  const primary900 = palette['900'] || '#0d144f';
  const accent = organization?.secondaryColor || '#ff6f00';
  const onPrimary = pickOn(primary);
  // Para el póster usamos el logo principal (web). Si la org subió SVG blanco,
  // sigue funcionando porque va sobre el header gradient brand.
  const logoData = await loadOrgLogoDataUri(organization);

  const url = buildKioskoUrl(activity, organization);
  const typeLabel = TYPE_LABELS[activity.type] || 'Evento';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Póster · ${esc(activity.name)}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: #1f2937;
    -webkit-print-color-adjust: exact;
  }
  .poster {
    width: 210mm;
    height: 297mm;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    position: relative;
    overflow: hidden;
  }

  /* Header brand */
  .poster-head {
    background: linear-gradient(135deg, ${primary} 0%, ${primary900} 100%);
    color: ${onPrimary};
    padding: 18mm 16mm 14mm;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .poster-head::after {
    content: '';
    position: absolute;
    right: -40mm; top: -40mm;
    width: 140mm; height: 140mm;
    background: ${accent};
    opacity: 0.16;
    border-radius: 50%;
  }
  .poster-head-inner { position: relative; z-index: 1; }
  .org-logo {
    height: 14mm; max-width: 80mm; width: auto; margin: 0 auto 6mm;
    display: block;
  }
  .org-name-fallback {
    font-size: 14pt; font-weight: 800; letter-spacing: 1px;
    margin-bottom: 6mm;
  }
  .poster-eyebrow {
    font-size: 9pt; font-weight: 700; letter-spacing: 4px;
    text-transform: uppercase; opacity: 0.85; margin-bottom: 4mm;
  }
  .poster-title {
    font-size: 30pt; font-weight: 800; line-height: 1.1;
    margin: 0 auto; max-width: 170mm;
  }

  /* Body con QR */
  .poster-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 14mm 16mm 8mm;
  }
  .poster-qr-wrap {
    background: #ffffff;
    border: 1.5mm solid ${primary50};
    border-radius: 6mm;
    padding: 6mm;
    box-shadow: 0 4mm 12mm rgba(15, 23, 42, 0.08);
  }
  .poster-qr {
    width: 90mm; height: 90mm; display: block;
  }
  .poster-cta {
    margin-top: 8mm;
    font-size: 22pt; font-weight: 800;
    color: ${primary};
    text-align: center;
  }
  .poster-cta-sub {
    margin-top: 2mm;
    font-size: 12pt; font-weight: 500;
    color: #6b7280; text-align: center;
  }
  .poster-url {
    margin-top: 4mm;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 10pt; color: ${primary};
    background: ${primary50};
    padding: 2mm 5mm;
    border-radius: 3mm;
    display: inline-block;
    letter-spacing: 0.3px;
  }

  /* Meta info */
  .poster-meta {
    margin-top: 10mm;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm 8mm;
    max-width: 170mm;
    width: 100%;
  }
  .poster-meta-item {
    display: flex; align-items: center; gap: 4mm;
    padding: 4mm 6mm;
    background: ${primary50};
    border-radius: 3mm;
    font-size: 11pt;
  }
  .poster-meta-icon {
    width: 8mm; height: 8mm;
    border-radius: 50%;
    background: ${primary};
    color: ${onPrimary};
    display: flex; align-items: center; justify-content: center;
    font-size: 12pt; flex-shrink: 0;
    font-weight: 700;
  }
  .poster-meta-text {
    display: flex; flex-direction: column; min-width: 0;
  }
  .poster-meta-label {
    font-size: 8pt; color: #6b7280;
    text-transform: uppercase; letter-spacing: 1px; font-weight: 700;
  }
  .poster-meta-value {
    font-size: 11pt; font-weight: 600; color: #1f2937;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* Footer */
  .poster-foot {
    background: ${primary};
    color: ${onPrimary};
    padding: 7mm 16mm;
    text-align: center;
    font-size: 9pt; font-weight: 700;
    letter-spacing: 2px; text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="poster">
    <header class="poster-head">
      <div class="poster-head-inner">
        ${logoData
          ? `<img src="${logoData}" alt="" class="org-logo" />`
          : `<div class="org-name-fallback">${esc(organization?.name || '')}</div>`}
        <div class="poster-eyebrow">${esc(typeLabel)}</div>
        <div class="poster-title">${esc(activity.name)}</div>
      </div>
    </header>

    <main class="poster-body">
      <div class="poster-qr-wrap">
        <img src="${qrDataUri}" class="poster-qr" alt="QR de registro" />
      </div>
      <div class="poster-cta">Escanea para registrarte</div>
      <div class="poster-cta-sub">Apunta la cámara de tu teléfono al código</div>
      <div class="poster-url">${esc(shortUrl(url))}</div>

      <div class="poster-meta">
        <div class="poster-meta-item">
          <div class="poster-meta-icon">📅</div>
          <div class="poster-meta-text">
            <div class="poster-meta-label">Fecha</div>
            <div class="poster-meta-value">${esc(fmtDateLong(activity.date))}</div>
          </div>
        </div>
        <div class="poster-meta-item">
          <div class="poster-meta-icon">📍</div>
          <div class="poster-meta-text">
            <div class="poster-meta-label">Lugar</div>
            <div class="poster-meta-value">${esc(activity.location || '—')}</div>
          </div>
        </div>
      </div>
    </main>

    <footer class="poster-foot">
      ${esc(organization?.name || 'contan2-saas')}
    </footer>
  </div>
</body>
</html>`;
}

export function posterFilename(activity) {
  const base = (activity.name || 'evento')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  return `Poster_${base}.pdf`;
}

export function qrFilename(activity) {
  const base = (activity.name || 'evento')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  return `QR_${base}.png`;
}
