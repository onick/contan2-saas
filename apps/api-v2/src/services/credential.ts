// apps/api-v2/src/services/credential.ts · genera el PNG de credencial del
// visitante (badge CR80 900×560). DISEÑO DE IMPRESIÓN: tarjeta plana clara
// (logo → divisor → nombre → rótulo → guión de acento → código · QR oscuro a la
// derecha), sin gradientes ni sombras. El QR contiene EXACTAMENTE el código del
// visitante (qrPayload de @contan2/codes = user.code), nada de URLs.
//
// FUENTES: el texto del SVG lo rasteriza sharp (librsvg→pango→fontconfig) con
// las fuentes del SISTEMA — la imagen Docker instala fonts-inter +
// fonts-liberation (igual que el Dockerfile v1); sin eso el texto sale en tofu.
//
// Logo: v1 lo lee del filesystem (/uploads); api-v2 no tiene ese FS, así que el
// logo se trae best-effort por fetch de una URL ABSOLUTA (con timeout). Si no
// hay logo o falla, cae al nombre de la org (igual que v1).

import sharp from 'sharp';
import QRCode from 'qrcode';
import { qrPayload } from '@contan2/codes';
import { resolveBrandingTokens, type OrgBranding } from './branding-tokens.js';

export interface CredentialUser {
  code: string;
  firstName: string;
  lastName: string;
}

function escapeXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Trae el logo del tenant como data-URI, best-effort. Solo URLs http(s)
// absolutas (api-v2 no tiene el filesystem de /uploads de v1). Timeout corto;
// cualquier fallo → null (la credencial cae al nombre de la org). Los SVG se
// RASTERIZAN a PNG con sharp (3x del área del badge): embedear SVG dentro del
// SVG del badge es frágil en librsvg, y el PNG resultante es determinista.
export async function loadLogoDataUri(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(logoUrl, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 2_000_000) return null;
    if (/^image\/svg\+xml/i.test(type)) {
      const png = await sharp(buf, { density: 300 }).resize({ width: 660, fit: 'inside' }).png().toBuffer();
      return `data:image/png;base64,${png.toString('base64')}`;
    }
    if (!/^image\/(png|jpeg|jpg|webp|gif)/i.test(type)) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Genera el PNG de credencial. `branding` aporta colores/nombre del tenant;
 * `logoDataUri` es opcional (best-effort vía loadLogoDataUri). Devuelve el
 * Buffer PNG (900×560).
 */
export async function generateCredentialPng(
  user: CredentialUser,
  branding: OrgBranding | null,
  logoDataUri: string | null = null,
): Promise<Buffer> {
  const tokens = resolveBrandingTokens(branding);

  // DISEÑO DE IMPRESIÓN (rediseño 2026-06-10, pedido del usuario): tarjeta
  // PLANA sobre fondo claro neutro — sin gradientes, sin sombras ni glow —
  // pensada para imprimirse y entregarse físicamente. La marca del tenant entra
  // por el LOGO (o el nombre como fallback) y por el guión de acento; el QR va
  // en módulos OSCUROS fijos (máxima fiabilidad de escaneo e impresión,
  // independiente del color de marca).
  const INK = '#2e3338'; // texto principal
  const MUTED = '#6a7075'; // texto secundario
  const PAPER = '#f4f4f2'; // fondo de tarjeta
  const LINE = '#d8d8d5'; // divisor / borde
  const QR_DARK = '#262a2e';

  // El QR lleva EXACTAMENTE el código (qrPayload = user.code · contrato v1).
  const qrDataUrl = await QRCode.toDataURL(qrPayload({ code: user.code }), {
    width: 320,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: QR_DARK, light: '#ffffff' },
  });

  const fullName = `${user.firstName} ${user.lastName}`.trim().toUpperCase();
  // Cuerpo adaptativo al largo; sólo se trunca en nombres extremos (>34 chars).
  const displayName = fullName.length > 34 ? `${fullName.slice(0, 32)}…` : fullName;
  const nameSize = fullName.length <= 16 ? 40 : fullName.length <= 24 ? 34 : 28;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
  <!-- Tarjeta: fondo claro plano + borde fino (guía de corte al imprimir) -->
  <rect x="1" y="1" width="898" height="558" fill="${PAPER}" rx="28" stroke="${LINE}" stroke-width="2"/>

  ${logoDataUri ? `
  <image x="64" y="26" width="390" height="203" href="${logoDataUri}" preserveAspectRatio="xMinYMid meet"/>` : `
  <text x="64" y="100" font-family="Inter, Liberation Sans, Helvetica, Arial, sans-serif" font-size="26" font-weight="800" fill="${INK}" letter-spacing="0.5">${escapeXml(tokens.orgName)}</text>`}

  <!-- Divisor de la columna izquierda -->
  <line x1="64" y1="244" x2="470" y2="244" stroke="${LINE}" stroke-width="2"/>

  <text x="64" y="314" font-family="Inter, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${nameSize}" font-weight="800" fill="${INK}" letter-spacing="1">${escapeXml(displayName)}</text>
  <text x="64" y="352" font-family="Inter, Liberation Sans, Helvetica, Arial, sans-serif" font-size="17" font-weight="500" fill="${MUTED}" letter-spacing="2">CREDENCIAL DE MIEMBRO</text>

  <rect x="64" y="390" width="44" height="4" rx="2" fill="${tokens.accent}"/>

  <text x="64" y="444" font-family="Liberation Mono, Menlo, Monaco, monospace" font-size="26" font-weight="700" fill="${INK}" letter-spacing="5">${escapeXml(user.code)}</text>

  <text x="64" y="496" font-family="Inter, Liberation Sans, Helvetica, Arial, sans-serif" font-size="12" font-weight="500" fill="${MUTED}" letter-spacing="1">Presentá este código QR en la entrada</text>
  <text x="64" y="516" font-family="Inter, Liberation Sans, Helvetica, Arial, sans-serif" font-size="12" fill="${MUTED}" fill-opacity="0.8">${escapeXml(tokens.orgName)}</text>

  <!-- QR a la derecha, en panel blanco con borde fino (sin sombra) -->
  <g transform="translate(540,110)">
    <rect x="0" y="0" width="300" height="300" rx="22" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>
    <image x="22" y="22" width="256" height="256" href="${qrDataUrl}"/>
  </g>
</svg>`;

  return sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
}
