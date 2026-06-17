// apps/api-v2/test/cover-upload.test.ts · unit (corre SIEMPRE, sin DB). Cubre
// detección por magic bytes, decode/proceso a WebP sin recorte (inside 1600×2400), path-safety,
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
  detectImageKind, assertAllowedImage, assertLogoImage, processCover, processLogo,
  persistCover, CoverError, LOGO_MAX_W, LOGO_MAX_H,
} from '../src/services/cover-upload.js';
import {
  isSafeUploadName, resolveWithinRoot, writeCoverAtomic, writeLogoAtomic, deletePreviousCoverIfV2,
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

describe('processCover → WebP sin recorte (inside 1600×2400)', () => {
  it('re-encoda a webp CONSERVANDO la proporción (120×80 → 1600×1067, sin recorte)', async () => {
    const out = await processCover(await png());
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1067); // 80 × (1600/120) — proporción 3:2 intacta
    expect(detectImageKind(out.data)).toBe('webp');
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(1067);
  });
  it('imagen vertical: el alto se limita a 2400 sin recortar (80×120 → 1600×2400)', async () => {
    const tall = await sharp({ create: { width: 80, height: 120, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
    const out = await processCover(tall);
    expect(out.width).toBe(1600);
    expect(out.height).toBe(2400);
  });
  it('imagen muy vertical (9:32): el alto manda y el ancho queda proporcional', async () => {
    const sliver = await sharp({ create: { width: 90, height: 320, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
    const out = await processCover(sliver);
    expect(out.height).toBe(2400);
    expect(out.width).toBe(675); // 90 × (2400/320)
  });
  it('lanza decode_failed con bytes inválidos', async () => {
    await expect(processCover(Buffer.from('not an image'))).rejects.toThrow(CoverError);
  });
});

describe('logo del tenant: assertLogoImage / processLogo / writeLogoAtomic', () => {
  it('assertLogoImage acepta png/jpeg/webp/svg y rechaza gif/garbage', async () => {
    expect(assertLogoImage(await png())).toBe('png');
    expect(assertLogoImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg');
    for (const bad of [Buffer.from('GIF89a'), Buffer.from('xxxx')]) {
      expect(() => assertLogoImage(bad)).toThrow(CoverError);
    }
  });

  it('processLogo normaliza a PNG dentro de 600×400 sin agrandar', async () => {
    // 1200×800 (excede) → encaja a 600×400 conservando proporción
    const big = await sharp({ create: { width: 1200, height: 800, channels: 4, background: { r: 200, g: 80, b: 0, alpha: 1 } } }).png().toBuffer();
    const out = await processLogo(big);
    expect(detectImageKind(out)).toBe('png');
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(LOGO_MAX_W);
    expect(meta.height).toBe(LOGO_MAX_H);
  });

  it('processLogo NO agranda un logo chico (withoutEnlargement)', async () => {
    const small = await sharp({ create: { width: 120, height: 60, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const meta = await sharp(await processLogo(small)).metadata();
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(60);
  });

  it('processLogo rasteriza SVG a PNG', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><rect width="100" height="40" fill="#e65100"/></svg>');
    const out = await processLogo(svg);
    expect(detectImageKind(out)).toBe('png');
  });

  it('processLogo lanza decode_failed con bytes inválidos', async () => {
    await expect(processLogo(Buffer.from('<svg garbage that wont decode'))).rejects.toThrow(CoverError);
  });

  it('writeLogoAtomic escribe un .png con nombre v2-logo-… y sin .tmp colgando', async () => {
    const name = await writeLogoAtomic(dir, Buffer.from('png-bytes'));
    expect(name).toMatch(/^v2-logo-[0-9a-f-]{36}\.png$/);
    expect(await readFile(path.join(dir, name))).toEqual(Buffer.from('png-bytes'));
    expect((await readdir(dir)).filter((f) => f.startsWith('.tmp-'))).toHaveLength(0);
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

  it('fallo de DB: borra el archivo nuevo (rollback), preserva el v2 anterior y no deja .tmp', async () => {
    const old = await writeCoverAtomic(dir, Buffer.from('old-v2'));
    const before = (await readdir(dir)).length;
    await expect(persistCover({
      root: dir,
      data: Buffer.from('new'),
      oldImageUrl: coverUrlFromName(old),
      update: async () => { throw new Error('db down'); },
    })).rejects.toThrow('db down');
    const files = await readdir(dir);
    expect(files.filter((f) => f.startsWith('.tmp-'))).toHaveLength(0); // sin temporales
    expect(files.length).toBe(before); // no quedó archivo nuevo
    expect((await stat(path.join(dir, old))).isFile()).toBe(true); // el v2 anterior NO se borró (update falló antes)
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
