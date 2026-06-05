// apps/api-v2/test/cover-atomic.test.ts · unit (sin DB). Atomicidad ante fallo de
// `rename`: se mockea node:fs/promises (pass-through salvo rename) para forzar un
// fallo del rename atómico y confirmar que NO queda `.tmp-*`, NO se crea el final,
// el UPDATE de DB NO se invoca y la portada anterior NO se borra.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

import * as fsp from 'node:fs/promises';
import { writeCoverAtomic, coverUrlFromName, StorageError } from '../src/storage.js';
import { persistCover } from '../src/services/cover-upload.js';

const renameMock = vi.mocked(fsp.rename);

let dir: string;
beforeEach(async () => { dir = await fsp.mkdtemp(path.join((await import('node:os')).tmpdir(), 'cover-atomic-')); });
afterEach(async () => { renameMock.mockClear(); await fsp.rm(dir, { recursive: true, force: true }); });

describe('writeCoverAtomic · fallo de rename', () => {
  it('rename falla → StorageError, sin .tmp y sin archivo final', async () => {
    renameMock.mockRejectedValueOnce(new Error('EXDEV cross-device'));
    await expect(writeCoverAtomic(dir, Buffer.from('payload'))).rejects.toBeInstanceOf(StorageError);
    const files = await fsp.readdir(dir);
    expect(files.filter((f) => f.startsWith('.tmp-'))).toHaveLength(0); // tmp limpiado
    expect(files.filter((f) => f.startsWith('v2-activity-'))).toHaveLength(0); // final no creado
  });
});

describe('persistCover · fallo de rename', () => {
  it('rename falla en el write → UPDATE no se invoca, portada anterior preservada, sin .tmp', async () => {
    const old = await writeCoverAtomic(dir, Buffer.from('old-v2')); // rename real (aún no mockeado a fallar)
    const update = vi.fn(async (u: string) => ({ image_url: u }));
    renameMock.mockRejectedValueOnce(new Error('EXDEV'));
    await expect(persistCover({
      root: dir, data: Buffer.from('new'), oldImageUrl: coverUrlFromName(old), update,
    })).rejects.toBeInstanceOf(StorageError);
    expect(update).not.toHaveBeenCalled(); // el write falló antes del UPDATE
    expect((await fsp.stat(path.join(dir, old))).isFile()).toBe(true); // anterior intacta
    const files = await fsp.readdir(dir);
    expect(files.filter((f) => f.startsWith('.tmp-'))).toHaveLength(0);
  });
});
