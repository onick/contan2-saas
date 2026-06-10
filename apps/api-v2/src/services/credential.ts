// apps/api-v2/src/services/credential.ts · genera el PNG de credencial del
// visitante (badge CR80 900×560, paridad con v1 backend/src/services/credential.js):
// gradiente de marca + nombre (cuerpo adaptativo al largo) + código + QR +
// chevrons decorativos del acento. El QR contiene EXACTAMENTE el código del
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
// cualquier fallo → null (la credencial cae al nombre de la org).
export async function loadLogoDataUri(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(logoUrl, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    // Gmail/clientes bloquean SVG; el badge es PNG así que sólo aceptamos raster.
    if (!/^image\/(png|jpeg|jpg|webp|gif)/i.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 2_000_000) return null;
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

  // El QR lleva EXACTAMENTE el código (qrPayload = user.code · contrato v1).
  const qrDataUrl = await QRCode.toDataURL(qrPayload({ code: user.code }), {
    width: 320,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: tokens.primary, light: '#ffffff' },
  });

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  // Nombre adaptativo: en vez de truncar agresivo, baja el cuerpo por tramos y
  // sólo recorta nombres extremos (>34 chars).
  const displayName = fullName.length > 34 ? `${fullName.slice(0, 32)}…` : fullName;
  const nameSize = fullName.length <= 16 ? 46 : fullName.length <= 24 ? 40 : 33;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${tokens.primary}" />
      <stop offset="55%" stop-color="${tokens.primaryMid}" />
      <stop offset="100%" stop-color="${tokens.primaryLight}" />
    </linearGradient>
    <linearGradient id="codebg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${tokens.accent}" />
      <stop offset="100%" stop-color="${tokens.accentLight}" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
      <feOffset dx="0" dy="6" result="offsetblur" />
      <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="900" height="560" fill="url(#bg)" rx="24" />

  <!-- Decoración: chevrons diagonales del acento en la esquina inferior derecha -->
  <g opacity="0.22">
    <path d="M 980 560 L 820 560 L 900 480 Z" fill="${tokens.accent}"/>
    <path d="M 900 560 L 760 560 L 830 490 Z" fill="${tokens.accentLight}" opacity="0.7"/>
  </g>

  ${logoDataUri ? `
  <g transform="translate(50,40)">
    <image x="0" y="0" width="180" height="100" href="${logoDataUri}" preserveAspectRatio="xMidYMid meet"/>
  </g>` : `
  <text x="50" y="80" font-family="Inter, Liberation Sans, Helvetica, Arial, sans-serif" font-size="20" font-weight="800" fill="${tokens.onPrimary}" letter-spacing="1">${escapeXml(tokens.orgName)}</text>`}

  <text x="50" y="196" font-family="Inter, Liberation Sans, Helvetica, Arial, sans-serif" font-size="13" font-weight="600" fill="${tokens.accentLight}" letter-spacing="3">CREDENCIAL DE MIEMBRO</text>
  <rect x="50" y="206" width="44" height="3" rx="1.5" fill="${tokens.accent}"/>
  <text x="50" y="262" font-family="Inter, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${nameSize}" font-weight="800" fill="${tokens.onPrimary}">${escapeXml(displayName)}</text>

  <g transform="translate(50,295)" filter="url(#shadow)">
    <rect x="0" y="0" width="340" height="70" rx="14" fill="url(#codebg)"/>
    <text x="170" y="46" text-anchor="middle" font-family="Liberation Mono, Menlo, Monaco, monospace" font-size="30" font-weight="700" fill="${tokens.onAccent}" letter-spacing="3">${escapeXml(user.code)}</text>
  </g>

  <text x="50" y="500" font-family="Inter, Liberation Sans, Helvetica, Arial, sans-serif" font-size="11" font-weight="600" fill="${tokens.onPrimary}" fill-opacity="0.6" letter-spacing="2">PRESENTAR ESTE QR EN LA ENTRADA</text>
  <text x="50" y="520" font-family="Inter, Liberation Sans, Helvetica, Arial, sans-serif" font-size="11" fill="${tokens.onPrimary}" fill-opacity="0.45">${escapeXml(tokens.orgName)}</text>

  <g transform="translate(580,80)" filter="url(#shadow)">
    <rect x="0" y="0" width="280" height="280" rx="20" fill="#ffffff"/>
    <image x="20" y="20" width="240" height="240" href="${qrDataUrl}"/>
  </g>

  <text x="720" y="402" text-anchor="middle" font-family="Inter, Liberation Sans, Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="${tokens.onPrimary}" fill-opacity="0.9" letter-spacing="1.5">ESCANEÁ TU QR</text>
  <text x="720" y="424" text-anchor="middle" font-family="Inter, Liberation Sans, Helvetica, Arial, sans-serif" font-size="11" fill="${tokens.onPrimary}" fill-opacity="0.6">para registrar tu asistencia</text>
</svg>`;

  return sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
}
