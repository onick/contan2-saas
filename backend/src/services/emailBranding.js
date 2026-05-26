// =============================================================================
// emailBranding.js · resuelve los assets de marca de una organización para
// usar consistentemente en emails y en la credencial PNG.
// =============================================================================

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
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
    // Timezone del tenant para formatear fechas dentro de los emails.
    // Default DR porque ese es el contexto del cliente ancla; cualquier
    // tenant puede sobreescribir vía organization.timezone.
    timezone: organization?.timezone || 'America/Santo_Domingo',
  };
}

async function readUploadAsDataUri(url) {
  if (!url || !url.startsWith('/uploads/')) return null;
  const filename = path.basename(url);
  const filePath = path.join(UPLOADS_DIR, filename);
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const mime = ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'gif' ? 'image/gif'
      : ext === 'svg' ? 'image/svg+xml'
      : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Como readUploadAsDataUri pero si el archivo es SVG lo rasteriza a PNG.
 * Necesario para emails (Gmail bloquea SVG por seguridad).
 * width define la resolución del raster (default 480px, suficiente para
 * @2x en un header de 240px).
 */
async function readUploadAsRasterPngDataUri(url, width = 480) {
  if (!url || !url.startsWith('/uploads/')) return null;
  const filename = path.basename(url);
  const filePath = path.join(UPLOADS_DIR, filename);
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  try {
    if (ext === 'svg') {
      const pngBuf = await sharp(filePath, { density: 288 })
        .resize({ width, withoutEnlargement: false })
        .png()
        .toBuffer();
      return `data:image/png;base64,${pngBuf.toString('base64')}`;
    }
    // Otros formatos: devolvemos tal cual.
    return readUploadAsDataUri(url);
  } catch (e) {
    console.error('[emailBranding] raster PNG falló:', e.message);
    return readUploadAsDataUri(url);
  }
}

/**
 * Lee el logo del tenant para uso web (sidebar, kiosko, credencial, PDF).
 * Usa organization.logoUrl. Null si no existe o el archivo falta.
 */
export async function loadOrgLogoDataUri(organization) {
  return readUploadAsDataUri(organization?.logoUrl);
}

/**
 * Lee el logo del tenant optimizado para emails. Muchos logos web son
 * blanco-sobre-transparente y desaparecen en clientes de correo (que
 * suelen tener fondo claro). Si la org subió email_logo_url, lo
 * preferimos; si no, caemos a logo_url normal.
 *
 * IMPORTANTE: si el logo es SVG lo rasterizamos a PNG porque Gmail y
 * varios clientes de correo bloquean SVG por seguridad.
 */
export async function loadEmailLogoDataUri(organization) {
  return (await readUploadAsRasterPngDataUri(organization?.emailLogoUrl, 480))
    ?? (await readUploadAsRasterPngDataUri(organization?.logoUrl, 480));
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
