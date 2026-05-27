import sharp from 'sharp';
import QRCode from 'qrcode';
import { resolveBrandingTokens, loadOrgLogoDataUri } from './emailBranding.js';

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Genera el PNG de credencial. Si se pasa `organization`, usa su logo,
 * colores y nombre. Si no, cae a defaults compatibles con CCB legacy.
 */
export async function generateCredentialPng(user, organization = null) {
  const tokens = resolveBrandingTokens(organization);
  const logoData = await loadOrgLogoDataUri(organization);

  const qrDataUrl = await QRCode.toDataURL(user.code, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: tokens.primary, light: '#ffffff' },
  });

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const displayName = fullName.length > 28 ? fullName.slice(0, 26) + '…' : fullName;
  // El email NO se incluye en el PNG. El visitante recibe el PNG por su
  // propio correo cuando el staff dispara `POST /api/credentials/:code/send`,
  // así que el email es contextual al destinatario y no aporta nada al
  // PNG. Removerlo reduce la PII portable si alguien comparte el link
  // público del PNG.

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

  ${logoData ? `
  <g transform="translate(50,40)">
    <image x="0" y="0" width="180" height="100" href="${logoData}" preserveAspectRatio="xMidYMid meet"/>
  </g>` : `
  <text x="50" y="80" font-family="Inter, Helvetica, Arial, sans-serif" font-size="20" font-weight="800" fill="${tokens.onPrimary}" letter-spacing="1">${escapeXml(tokens.orgName)}</text>`}

  <text x="50" y="200" font-family="Inter, Helvetica, Arial, sans-serif" font-size="13" font-weight="600" fill="${tokens.accentLight}" letter-spacing="3">CREDENCIAL DE MIEMBRO</text>
  <text x="50" y="260" font-family="Inter, Helvetica, Arial, sans-serif" font-size="42" font-weight="800" fill="${tokens.onPrimary}">${escapeXml(displayName)}</text>

  <g transform="translate(50,295)" filter="url(#shadow)">
    <rect x="0" y="0" width="320" height="70" rx="14" fill="url(#codebg)"/>
    <text x="160" y="48" text-anchor="middle" font-family="Menlo, Monaco, monospace" font-size="32" font-weight="700" fill="${tokens.onAccent}" letter-spacing="4">${escapeXml(user.code)}</text>
  </g>

  <text x="50" y="500" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" font-weight="600" fill="${tokens.onPrimary}" fill-opacity="0.55" letter-spacing="2">PRESENTAR ESTE QR EN LA ENTRADA</text>
  <text x="50" y="520" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${tokens.onPrimary}" fill-opacity="0.45">${escapeXml(tokens.orgName)}</text>

  <g transform="translate(580,80)" filter="url(#shadow)">
    <rect x="0" y="0" width="280" height="280" rx="20" fill="#ffffff"/>
    <image x="20" y="20" width="240" height="240" href="${qrDataUrl}"/>
  </g>

  <text x="720" y="400" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="13" font-weight="600" fill="${tokens.onPrimary}" fill-opacity="0.85" letter-spacing="1">ESCANEA TU QR</text>
  <text x="720" y="422" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${tokens.onPrimary}" fill-opacity="0.55">para registrar tu asistencia</text>
</svg>`;

  return sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
}
