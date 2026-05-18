// =============================================================================
// activityQR.js · genera el QR de una actividad (con logo opcional del
// tenant en el centro) y construye la URL pública del kiosko que el
// visitante recibe al escanear.
// =============================================================================

import QRCode from 'qrcode';
import sharp from 'sharp';
import { loadEmailLogoDataUri } from './emailBranding.js';
import { config } from '../config.js';

/**
 * URL que el QR codifica. El kiosko detecta ?activity=<id> y salta al
 * check-in directo para esa actividad. Si el feature de auto-select aún
 * no estuviera activo, el visitante igual termina en la home del kiosko
 * (fallback graceful).
 */
export function buildKioskoUrl(activity, organization) {
  // Construcción tenant-aware del host: subdomain o custom domain.
  // Si la org tiene custom_domain configurado, lo preferimos.
  let host;
  if (organization?.customDomain) {
    host = `https://${organization.customDomain}`;
  } else if (organization?.slug && config.ROOT_DOMAIN && config.ROOT_DOMAIN !== 'localhost') {
    host = `https://${organization.slug}.${config.ROOT_DOMAIN}`;
  } else {
    host = config.PUBLIC_URL || 'https://ccb.contan2.com';
  }
  return `${host}/kiosko?activity=${encodeURIComponent(activity.id)}`;
}

/**
 * Genera el PNG del QR de una actividad. Si la org tiene logo de email
 * (color, sobre fondo claro), lo incrustamos en el centro del QR. Error
 * correction nivel H (30%) permite el logo sin romper la lectura.
 *
 * @param activity      objeto actividad
 * @param organization  objeto organización del tenant
 * @param opts.size     ancho/alto en px del QR (default 800)
 */
export async function generateActivityQrPng(activity, organization, opts = {}) {
  const size = opts.size || 800;
  const url = buildKioskoUrl(activity, organization);
  const primary = organization?.primaryColor || '#1a237e';

  // QR base — error correction H para tolerar el logo en el centro.
  const qrBuffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'H',
    width: size,
    margin: 2,
    color: { dark: primary, light: '#ffffff' },
  });

  // Cargar logo del tenant (preferimos email logo: típicamente color sobre
  // blanco, ideal para superponer sobre el fondo blanco del QR).
  const logoUri = await loadEmailLogoDataUri(organization);
  if (!logoUri) return qrBuffer;

  const m = /^data:([^;]+);base64,(.+)$/.exec(logoUri);
  if (!m) return qrBuffer;
  const logoBuf = Buffer.from(m[2], 'base64');

  // Logo a ~20% del QR, con padding blanco para destacar del patrón.
  const logoSize = Math.round(size * 0.20);
  let resizedLogo;
  try {
    resizedLogo = await sharp(logoBuf)
      .resize({ width: logoSize, height: logoSize, fit: 'inside' })
      .extend({
        top: 10, bottom: 10, left: 10, right: 10,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer();
  } catch (e) {
    console.error('[activityQR] resize logo falló, devolviendo QR sin logo:', e.message);
    return qrBuffer;
  }

  try {
    return await sharp(qrBuffer)
      .composite([{ input: resizedLogo, gravity: 'center' }])
      .png()
      .toBuffer();
  } catch (e) {
    console.error('[activityQR] composite logo falló, devolviendo QR sin logo:', e.message);
    return qrBuffer;
  }
}
