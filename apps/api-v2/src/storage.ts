// apps/api-v2/src/storage.ts · capa de almacenamiento de portadas (filesystem).
// Propiedad de api-v2 (serving S2). Reglas duras:
//   · Root configurable por UPLOADS_DIR (staging/prod = volumen montado, p.ej.
//     /data/contan2/uploads; dev/tests = temporal). NO se asume que exista; si
//     no es escribible, falla claro.
//   · Nombres de archivo v2 INMUTABLES: `v2-activity-<uuid>.webp`. Nunca el
//     nombre original del cliente.
//   · Escritura ATÓMICA: tmp en el mismo volumen → rename. `wx` (no sobrescribe).
//   · Borrado automático SOLO de archivos que cumplen EXACTO el patrón v2; los
//     legacy (`/uploads/<v1>`) jamás se borran automáticamente.
//   · Path safety: nombres seguros (sin `..`, sin separadores), resueltos contra
//     el root; el resultado debe quedar dentro del root.

import os from 'node:os';
import path from 'node:path';
import { access, mkdir, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { randomUUID } from 'node:crypto';

export class StorageError extends Error {
  constructor(public readonly code: 'uploads_dir_unwritable' | 'write_failed', message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

// Patrón EXACTO de archivo v2 (uuid v4 + .webp). Sólo estos se borran automático.
const V2_COVER_RE = /^v2-activity-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;
// Nombre servible: caracteres seguros + extensión de imagen conocida. Cubre v2
// (.webp) y legacy v1 (.png/.jpg/.jpeg/.gif). Sin `..`, sin separadores.
const SAFE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(webp|png|jpe?g|gif)$/i;

const CONTENT_TYPE: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

// Root de uploads. Explícito vía UPLOADS_DIR; si no, temporal de dev.
export function uploadsRoot(): string {
  const env = process.env.UPLOADS_DIR?.trim();
  return env ? path.resolve(env) : path.join(os.tmpdir(), 'contan2-uploads-dev');
}
function uploadsRootIsExplicit(): boolean {
  return Boolean(process.env.UPLOADS_DIR?.trim());
}

// Garantiza que el root sea escribible. Si UPLOADS_DIR está seteado (staging/
// prod/tests), NO se crea (debe pre-existir el volumen) → falla claro si falta.
// Sin UPLOADS_DIR (dev), se crea el temporal. Devuelve el root absoluto.
export async function ensureWritableRoot(): Promise<string> {
  const root = uploadsRoot();
  if (!uploadsRootIsExplicit()) {
    await mkdir(root, { recursive: true }).catch(() => {});
  }
  try {
    await access(root, FS.W_OK);
  } catch {
    throw new StorageError('uploads_dir_unwritable', `Directorio de uploads no escribible: ${root}`);
  }
  return root;
}

export function isSafeUploadName(name: string): boolean {
  if (!name || name.length > 128) return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
  return SAFE_NAME_RE.test(name);
}

export function isV2CoverName(name: string): boolean {
  return V2_COVER_RE.test(name);
}

// Resuelve `name` contra `root` validando seguridad + contención. null si inseguro.
export function resolveWithinRoot(root: string, name: string): string | null {
  if (!isSafeUploadName(name)) return null;
  const abs = path.resolve(root, name);
  const base = path.resolve(root);
  if (abs !== path.join(base, name) || !abs.startsWith(base + path.sep)) return null;
  return abs;
}

export function contentTypeFor(name: string): string | null {
  return CONTENT_TYPE[path.extname(name).toLowerCase()] ?? null;
}

export function coverUrlFromName(name: string): string {
  return `/uploads/${name}`;
}

// Escritura ATÓMICA de una portada v2: tmp (wx) → rename. Devuelve el nombre
// final inmutable. El uuid garantiza que el final no exista (no sobrescribe).
export async function writeCoverAtomic(root: string, data: Buffer): Promise<string> {
  const finalName = `v2-activity-${randomUUID()}.webp`;
  const finalPath = path.join(root, finalName);
  const tmpPath = path.join(root, `.tmp-${randomUUID()}.webp`);
  try {
    await writeFile(tmpPath, data, { flag: 'wx' });
    await rename(tmpPath, finalPath);
  } catch (e) {
    await unlink(tmpPath).catch(() => {});
    throw new StorageError('write_failed', `No se pudo escribir la portada: ${(e as Error).message}`);
  }
  return finalName;
}

// Borra un archivo v2 por su nombre (rollback del archivo nuevo). Best-effort.
export async function deleteCoverByName(root: string, name: string): Promise<void> {
  const abs = resolveWithinRoot(root, name);
  if (abs) await unlink(abs).catch(() => {});
}

// Borra el archivo de una portada ANTERIOR a partir de su image_url, SOLO si es
// un archivo v2 (patrón exacto). Legacy (`/uploads/<v1>`) → NO se toca. Devuelve
// true si borró (para tests).
export async function deletePreviousCoverIfV2(root: string, oldImageUrl: string | null): Promise<boolean> {
  if (!oldImageUrl) return false;
  const m = /^\/uploads\/(.+)$/.exec(oldImageUrl);
  if (!m) return false;
  const name = m[1]!;
  if (!isV2CoverName(name)) return false; // legacy → preservar
  const abs = resolveWithinRoot(root, name);
  if (!abs) return false;
  try {
    await unlink(abs);
    return true;
  } catch {
    return false;
  }
}

export async function fileExists(absPath: string): Promise<boolean> {
  try {
    const s = await stat(absPath);
    return s.isFile();
  } catch {
    return false;
  }
}
