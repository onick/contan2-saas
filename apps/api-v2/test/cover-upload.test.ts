// apps/api-v2/test/cover-upload.test.ts · unit (corre SIEMPRE, sin DB). Cubre
// detección por magic bytes, decode/proceso a WebP 1600×900, path-safety,
// escritura atómica, ownership v2 vs legacy, y la orquestación persistCover
// (rollback del archivo nuevo si falla la DB; legacy preservado). Usa un
// directorio temporal y lo limpia.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  detectImageKind, assertAllowedImage, processCover, persistCover, CoverError,
} from '../src/services/cover-upload.js';
import {
  isSafeUploadName, resolveWithinRoot, writeCoverAtomic, deletePreviousCoverIfV2,
  ensureWritableRoot, StorageError, coverUrlFromName, isV2CoverName,
} from '../src/storage.js';

let dir: string;
beforeAll(async () => { dir = await mkdtemp(path.join(tmpdir(), 'cover-test-')); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });
afterEach(() => { vi.restoreAllMocks(); });

const png = () => sharp({ create: { width: 120, height: 80, channels: 3, background: { r: 200, g: 80, b: 0 } } }).png().toBuffer();
const jpeg = () => sharp({ create: { width: 120, height: 80, channels: 3, background: { r: 10, g: 120, b: 200 } } }).jpeg().toBuffer();
const webp = () => sharp({ create: { width: 120, height: 80, channels: 3, background: { r: 0, g: 0, b: 0 } } }).webp().toBuffer();

describe('detectImageKind / assertAllowedImage (magic bytes)', () => {
  it('reconoce jpeg/png/webp reales', async () => {
    expect(detectImageKind(await jpeg())).toBe('jpeg');
    expect(detectImageKind(await png())).toBe('png');
    expect(detectImageKind(await webp())).toBe('webp');
  });
  it('detecta svg/gif/desconocido', () => {
    expect(detectImageKind(Buffer.from('<?xml version="1.0"?><svg xmlns="..."></svg>'))).toBe('svg');
    expect(detectImageKind(Buffer.from('<svg></svg>'))).toBe('svg');
    expect(detectImageKind(Buffer.from('GIF89a....'))).toBe('gif');
    expect(detectImageKind(Buffer.from('not an image at all'))).toBe('unknown');
  });
  it('assertAllowedImage acepta png/jpeg/webp y rechaza svg/gif/garbage', async () => {
    expect(assertAllowedImage(await png())).toBe('png');
    for (const bad of [Buffer.from('<svg></svg>'), Buffer.from('GIF89a'), Buffer.from('xxxx')]) {
      expect(() => assertAllowedImage(bad)).toThrow(CoverError);
    }
  });
});

describe('processCover → WebP 1600×900', () => {
  it('re-encoda a webp exacto 1600×900', async () => {
    const out = await processCover(await png());
    expect(out.width).toBe(1600);
    expect(out.height).toBe(900);
    expect(detectImageKind(out.data)).toBe('webp');
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(900);
  });
  it('lanza decode_failed con bytes inválidos', async () => {
    await expect(processCover(Buffer.from('not an image'))).rejects.toThrow(CoverError);
  });
});

describe('path safety', () => {
  it('isSafeUploadName rechaza traversal/separadores y exige extensión imagen', () => {
    expect(isSafeUploadName(`v2-activity-${randomUUID()}.webp`)).toBe(true);
    expect(isSafeUploadName('1779905697017-0dff79cff388.png')).toBe(true); // legacy v1
    expect(isSafeUploadName('../etc/passwd')).toBe(false);
    expect(isSafeUploadName('a/b.png')).toBe(false);
    expect(isSafeUploadName('a\\b.png')).toBe(false);
    expect(isSafeUploadName('x.svg')).toBe(false);
    expect(isSafeUploadName('x.txt')).toBe(false);
    expect(isSafeUploadName('..')).toBe(false);
  });
  it('resolveWithinRoot devuelve null para nombres inseguros y path dentro del root para válidos', () => {
    expect(resolveWithinRoot(dir, '../escape.png')).toBeNull();
    const ok = resolveWithinRoot(dir, 'a.png');
    expect(ok).toBe(path.join(dir, 'a.png'));
  });
});

describe('writeCoverAtomic + ownership', () => {
  it('escribe un archivo v2 con el patrón inmutable y el contenido exacto', async () => {
    const buf = Buffer.from('webp-bytes-placeholder');
    const name = await writeCoverAtomic(dir, buf);
    expect(isV2CoverName(name)).toBe(true);
    expect(await readFile(path.join(dir, name))).toEqual(buf);
    // no deja .tmp colgando
    const left = (await readdir(dir)).filter((f) => f.startsWith('.tmp-'));
    expect(left).toHaveLength(0);
  });

  it('deletePreviousCoverIfV2: borra v2, preserva legacy', async () => {
    const v2 = await writeCoverAtomic(dir, Buffer.from('v2'));
    const legacyName = '1779905697017-0dff79cff388.png';
    await writeFile(path.join(dir, legacyName), Buffer.from('legacy'));
    // legacy → NO borra
    expect(await deletePreviousCoverIfV2(dir, coverUrlFromName(legacyName))).toBe(false);
    expect((await stat(path.join(dir, legacyName))).isFile()).toBe(true);
    // v2 → borra
    expect(await deletePreviousCoverIfV2(dir, coverUrlFromName(v2))).toBe(true);
    await expect(stat(path.join(dir, v2))).rejects.toBeTruthy();
  });
});

describe('persistCover (atomicidad)', () => {
  it('éxito: escribe el nuevo y borra el v2 anterior', async () => {
    const old = await writeCoverAtomic(dir, Buffer.from('old'));
    const { name, url, row } = await persistCover({
      root: dir,
      data: Buffer.from('new'),
      oldImageUrl: coverUrlFromName(old),
      update: async (u) => ({ image_url: u }),
    });
    expect(url).toBe(`/uploads/${name}`);
    expect(row).toEqual({ image_url: url });
    expect((await stat(path.join(dir, name))).isFile()).toBe(true); // nuevo existe
    await expect(stat(path.join(dir, old))).rejects.toBeTruthy(); // viejo v2 borrado
  });

  it('fallo de DB: borra el archivo nuevo (rollback) y propaga', async () => {
    const before = (await readdir(dir)).length;
    await expect(persistCover({
      root: dir,
      data: Buffer.from('new'),
      oldImageUrl: null,
      update: async () => { throw new Error('db down'); },
    })).rejects.toThrow('db down');
    const after = (await readdir(dir)).filter((f) => !f.startsWith('.tmp-')).length;
    expect(after).toBe(before); // ningún archivo nuevo quedó
  });

  it('reemplazo de legacy: NO borra el archivo legacy', async () => {
    const legacyName = `1779905000000-${randomUUID().slice(0, 12)}.png`;
    await writeFile(path.join(dir, legacyName), Buffer.from('legacy-keep'));
    await persistCover({
      root: dir,
      data: Buffer.from('new'),
      oldImageUrl: coverUrlFromName(legacyName),
      update: async (u) => ({ image_url: u }),
    });
    expect((await stat(path.join(dir, legacyName))).isFile()).toBe(true); // preservado
  });
});

describe('ensureWritableRoot', () => {
  it('falla claro si UPLOADS_DIR explícito no existe/no es escribible', async () => {
    const prev = process.env.UPLOADS_DIR;
    process.env.UPLOADS_DIR = path.join(dir, 'no-existe-' + randomUUID());
    try {
      await expect(ensureWritableRoot()).rejects.toBeInstanceOf(StorageError);
    } finally {
      if (prev === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = prev;
    }
  });
  it('ok si UPLOADS_DIR apunta a un dir escribible', async () => {
    const prev = process.env.UPLOADS_DIR;
    process.env.UPLOADS_DIR = dir;
    try {
      expect(await ensureWritableRoot()).toBe(dir);
    } finally {
      if (prev === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = prev;
    }
  });
});
