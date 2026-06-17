// apps/api-v2/src/services/cover-upload.ts · validación + procesamiento +
// persistencia de portadas de actividad. NO confía en MIME/extensión: decide por
// MAGIC BYTES y luego DECODE real con sharp. Salida: WebP SIN RECORTE (fit
// inside, máx 1600×2400, auto-orientada por EXIF): se conserva la proporción
// original para que el ENCUADRE vertical (image_pos_y + drag en el admin) tenga
// excedente real que desplazar — el recorte a 16:9 lo hace el CSS (object-cover
// + object-position) en cada superficie, no el servidor (no es destructivo). La orquestación de persistencia es atómica y hace
// rollback del archivo nuevo si el UPDATE de DB falla; al reemplazar, borra el
// archivo v2 anterior SÓLO tras el éxito (legacy preservado).

import sharp from 'sharp';
import { writeCoverAtomic, deleteCoverByName, deletePreviousCoverIfV2, coverUrlFromName } from '../storage.js';

export const MAX_COVER_BYTES = 5 * 1024 * 1024; // 5 MB
export const COVER_WIDTH = 1600;
// Tope de alto del lienzo (no recorta: limita la resolución de imágenes muy
// verticales; un 9:16 entra como 1350×2400). El alto REAL depende del original.
export const COVER_MAX_HEIGHT = 2400;

export type CoverErrorCode = 'unsupported_type' | 'decode_failed' | 'update_failed';
export class CoverError extends Error {
  constructor(public readonly code: CoverErrorCode, message: string) {
    super(message);
    this.name = 'CoverError';
  }
}

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'svg' | 'unknown';

// Detección por MAGIC BYTES (no por header MIME ni extensión del cliente).
export function detectImageKind(buf: Buffer): ImageKind {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  const head = buf.subarray(0, 256).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'svg';
  return 'unknown';
}

// Acepta SOLO jpeg/png/webp reales. Rechaza svg/gif/desconocido. Lanza CoverError.
export function assertAllowedImage(buf: Buffer): 'jpeg' | 'png' | 'webp' {
  const kind = detectImageKind(buf);
  if (kind === 'jpeg' || kind === 'png' || kind === 'webp') return kind;
  throw new CoverError('unsupported_type', 'Formato no permitido. Usá JPEG, PNG o WebP.');
}

// Decode REAL + normalización: auto-orient (EXIF) → inside 1600×2400 (SIN
// recorte; escala hasta tocar el lienzo por dentro, conservando proporción) →
// WebP. withoutEnlargement:false mantiene la garantía de nitidez previa
// (imágenes chicas se escalan hacia arriba igual que antes).

// ── LOGO del tenant ──────────────────────────────────────────────────────────
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
export const LOGO_MAX_W = 600;
export const LOGO_MAX_H = 400;

// Logos: acepta también SVG (común en identidad). Rechaza gif/desconocido.
export function assertLogoImage(buf: Buffer): 'jpeg' | 'png' | 'webp' | 'svg' {
  const kind = detectImageKind(buf);
  if (kind === 'jpeg' || kind === 'png' || kind === 'webp' || kind === 'svg') return kind;
  throw new CoverError('unsupported_type', 'Formato no permitido. Usá PNG, SVG, JPEG o WebP.');
}

// Decode REAL + normalización del logo → PNG (preserva transparencia), encajado
// en 600×400 sin agrandar (logos chicos quedan nítidos). SVG se rasteriza con
// densidad alta. El PNG resultante lo sirve /uploads y lo lee la credencial.
export async function processLogo(buf: Buffer): Promise<Buffer> {
  const kind = assertLogoImage(buf);
  try {
    const input = kind === 'svg' ? sharp(buf, { density: 300 }) : sharp(buf);
    return await input
      .resize(LOGO_MAX_W, LOGO_MAX_H, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    throw new CoverError('decode_failed', 'No se pudo procesar el logo.');
  }
}

export async function processCover(buf: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  try {
    const out = await sharp(buf)
      .rotate() // auto-orienta por EXIF y descarta metadata de orientación
      .resize(COVER_WIDTH, COVER_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: false })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data: out.data, width: out.info.width, height: out.info.height };
  } catch {
    throw new CoverError('decode_failed', 'No se pudo procesar la imagen.');
  }
}

// Orquestación atómica de persistencia. `update(url)` asocia la URL en DB y
// devuelve la fila (o null). Si falla → borra el archivo nuevo (rollback). En
// éxito → borra best-effort el archivo v2 ANTERIOR (legacy preservado).
export async function persistCover<TRow>(opts: {
  root: string;
  data: Buffer;
  oldImageUrl: string | null;
  update: (newUrl: string) => Promise<TRow | null | undefined>;
}): Promise<{ name: string; url: string; row: TRow }> {
  const { root, data, oldImageUrl, update } = opts;
  const name = await writeCoverAtomic(root, data);
  const url = coverUrlFromName(name);
  let row: TRow | null | undefined;
  try {
    row = await update(url);
    if (!row) throw new CoverError('update_failed', 'No se pudo asociar la portada a la actividad.');
  } catch (e) {
    await deleteCoverByName(root, name); // rollback del archivo nuevo
    throw e;
  }
  // Éxito confirmado → recién ahora se borra el archivo v2 anterior (best-effort).
  await deletePreviousCoverIfV2(root, oldImageUrl);
  return { name, url, row };
}
