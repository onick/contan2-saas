import sharp from 'sharp';
import QRCode from 'qrcode';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, '..', '..', '..', 'frontend', 'assets', 'logo.png');

let _logoBase64 = null;
async function getLogoBase64() {
  if (_logoBase64) return _logoBase64;
  try {
    const buf = await fs.readFile(LOGO_PATH);
    _logoBase64 = 'data:image/png;base64,' + buf.toString('base64');
  } catch (e) {
    console.error('[credential] no se pudo leer logo:', e.message);
    _logoBase64 = '';
  }
  return _logoBase64;
}

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function generateCredentialPng(user) {
  const qrDataUrl = await QRCode.toDataURL(user.code, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1a237e', light: '#ffffff' },
  });
  const logoData = await getLogoBase64();

  const fullName = `${user.firstName} ${user.lastName}`;
  const displayName = fullName.length > 28 ? fullName.slice(0, 26) + '…' : fullName;
  const email = user.email && user.email.length < 36 ? user.email : '';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a237e" />
      <stop offset="55%" stop-color="#2e3585" />
      <stop offset="100%" stop-color="#534bae" />
    </linearGradient>
    <linearGradient id="codebg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff6f00" />
      <stop offset="100%" stop-color="#ffa040" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
      <feOffset dx="0" dy="6" result="offsetblur" />
      <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="900" height="560" fill="url(#bg)" rx="24" />

  <g transform="translate(50,40)">
    <rect x="0" y="0" width="160" height="100" rx="14" fill="#ffffff"/>
    ${logoData ? `<image x="14" y="10" width="132" height="80" href="${logoData}" preserveAspectRatio="xMidYMid meet"/>` : ''}
  </g>

  <text x="50" y="200" font-family="Inter, Helvetica, Arial, sans-serif" font-size="13" font-weight="600" fill="#ffa040" letter-spacing="3">CREDENCIAL DE MIEMBRO</text>
  <text x="50" y="260" font-family="Inter, Helvetica, Arial, sans-serif" font-size="42" font-weight="800" fill="#ffffff">${escapeXml(displayName)}</text>

  <g transform="translate(50,295)" filter="url(#shadow)">
    <rect x="0" y="0" width="320" height="70" rx="14" fill="url(#codebg)"/>
    <text x="160" y="48" text-anchor="middle" font-family="Menlo, Monaco, monospace" font-size="32" font-weight="700" fill="#ffffff" letter-spacing="4">${escapeXml(user.code)}</text>
  </g>

  ${email ? `<text x="50" y="410" font-family="Inter, Helvetica, Arial, sans-serif" font-size="16" fill="rgba(255,255,255,0.75)">${escapeXml(email)}</text>` : ''}

  <text x="50" y="500" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" font-weight="600" fill="rgba(255,255,255,0.5)" letter-spacing="2">PRESENTAR ESTE QR EN LA ENTRADA</text>
  <text x="50" y="520" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="rgba(255,255,255,0.4)">Centro Cultural Banreservas</text>

  <g transform="translate(580,80)" filter="url(#shadow)">
    <rect x="0" y="0" width="280" height="280" rx="20" fill="#ffffff"/>
    <image x="20" y="20" width="240" height="240" href="${qrDataUrl}"/>
  </g>

  <text x="720" y="400" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="13" font-weight="600" fill="rgba(255,255,255,0.8)" letter-spacing="1">ESCANEA TU QR</text>
  <text x="720" y="422" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="rgba(255,255,255,0.5)">para registrar tu asistencia</text>
</svg>`;

  return sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
}
