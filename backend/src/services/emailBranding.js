// =============================================================================
// emailBranding.js · resuelve los assets de marca de una organización para
// usar consistentemente en emails y en la credencial PNG.
// =============================================================================

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { generatePalette, pickOn } from '../utils/palette.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');

/**
 * Devuelve tokens de branding listos para inyectar en HTML/SVG inline.
 * Si no hay organización, cae a defaults seguros.
 */
export function resolveBrandingTokens(organization) {
  const primary = organization?.primaryColor || '#1a237e';
  const accent = organization?.secondaryColor || '#ff6f00';
  const palette = generatePalette(primary) || {};
  const primaryDark = palette['900'] || '#0d144f';
  const primaryMid = palette['500'] || '#3949ab';
  const primaryLight = palette['400'] || '#534bae';
  const accentLight = '#ffa040'; // matemáticamente difícil sin segunda paleta
  const onPrimary = pickOn(palette['700'] || primary);
  const onAccent = pickOn(accent);
  return {
    primary, primaryDark, primaryMid, primaryLight,
    accent, accentLight,
    onPrimary, onAccent,
    orgName: organization?.name || 'contan2-saas',
  };
}

/**
 * Lee el logo del tenant del volumen de uploads y devuelve un data-URI base64.
 * Devuelve null si la org no tiene logoUrl o el archivo no existe.
 */
export async function loadOrgLogoDataUri(organization) {
  const url = organization?.logoUrl;
  if (!url || !url.startsWith('/uploads/')) return null;
  const filename = path.basename(url);
  const filePath = path.join(UPLOADS_DIR, filename);
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const mime = ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'gif' ? 'image/gif'
      : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Resuelve la dirección "From" del email para esta organización.
 * Prefiere org.emailFromAddr + org.emailFromName si están seteados;
 * si no, cae al EMAIL_FROM global.
 */
export function resolveFromAddress(organization) {
  if (organization?.emailFromAddr) {
    const name = organization.emailFromName || organization.name || 'contan2-saas';
    return `${name} <${organization.emailFromAddr}>`;
  }
  return config.EMAIL_FROM;
}

/**
 * Reply-To opcional. Prefiere el de la org si existe.
 */
export function resolveReplyTo(organization) {
  return organization?.emailReplyTo || null;
}
