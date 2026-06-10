// apps/api-v2/test/activities-with-cover.test.ts · integration (skip sin DATABASE_URL).
// POST /api/v2/activities/with-cover · creación ATÓMICA con portada obligatoria.
// Usa un UPLOADS_DIR temporal. Cubre: éxito (activa + image_url desde el inicio +
// WebP en disco), portada faltante/múltiple/inválida/oversize, body inválido (sin
// archivo ni actividad), campos prohibidos, roles/auth/cross-tenant, cero .tmp-*,
// rollback de archivo si el INSERT falla (unit de persistCover), y legacy intacto.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import sharp from 'sharp';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { ActivityCreateResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';
import { persistCover, CoverError } from '../src/services/cover-upload.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

const realPng = () => sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 80, b: 0 } } }).png().toBuffer();
const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

type Part = { kind: 'file'; name: string; filename: string; ct: string; buffer: Buffer } | { kind: 'field'; name: string; value: string };
function multipartRaw(parts: Part[]) {
  const boundary = '----wc' + randomUUID().replace(/-/g, '');
  const chunks: Buffer[] = [];
  for (const p of parts) {
    if (p.kind === 'field') {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`));
    } else {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.ct}\r\n\r\n`));
      chunks.push(p.buffer); chunks.push(Buffer.from('\r\n'));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), ct: `multipart/form-data; boundary=${boundary}` };
}

const fieldParts = (over: Record<string, string> = {}): Part[] => {
  const base: Record<string, string> = { name: 'Concierto con portada', type: 'concierto', location: 'Sala 2', date: future(7), capacity: '80' };
  const merged = { ...base, ...over };
  return Object.entries(merged).filter(([, v]) => v !== undefined).map(([name, value]) => ({ kind: 'field', name, value } as Part));
};

run('POST /activities/with-cover · creación atómica con portada', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  let uploadsDir: string;
  const stamp = Date.now();
  const slugA = `wc-a-${stamp}`;
  const slugB = `wc-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { owner: `wc-own-${stamp}`, admin: `wc-adm-${stamp}`, operator: `wc-ope-${stamp}`, b: `wc-b-${stamp}` };

  const mkOrg = async (slug: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@t.local`,
      password_hash: 'x', full_name: `S ${role}`, status: 'active', role,
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
  };

  beforeAll(async () => {
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'wc-uploads-'));
    process.env.UPLOADS_DIR = uploadsDir;
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
    delete process.env.UPLOADS_DIR;
    await rm(uploadsDir, { recursive: true, force: true });
  });

  async function post(parts: Part[], token?: string, host = hostA) {
    const mp = multipartRaw(parts);
    return app.inject({ method: 'POST', url: '/api/v2/activities/with-cover', headers: { host, 'content-type': mp.ct, ...(token ? { cookie: `contan2_session=${token}` } : {}) }, payload: mp.payload });
  }
  const withFile = async (over: Record<string, string> = {}, files = 1): Promise<Part[]> => {
    const parts = fieldParts(over);
    for (let i = 0; i < files; i++) parts.push({ kind: 'file', name: 'cover', filename: `c${i}.png`, ct: 'image/png', buffer: await realPng() });
    return parts;
  };
  const countActs = async (org: string) => Number((await db.selectFrom('activities').select(db.fn.countAll<number>().as('n')).where('organization_id', '=', org).executeTakeFirstOrThrow()).n);
  const tmpFiles = async () => (await readdir(uploadsDir)).filter((f) => f.startsWith('.tmp-'));

  it('admin crea con portada → 201, activa, image_url desde el inicio, WebP en disco', async () => {
    const res = await post(await withFile({ description: '  Hola  ', category: 'Música Viva' }), TOK.admin);
    expect(res.statusCode).toBe(201);
    const { activity } = ActivityCreateResponseSchema.parse(res.json());
    expect(activity.status).toBe('activa');
    expect(activity.enrolledCount).toBe(0);
    expect(activity.imageUrl).toMatch(/^\/uploads\//); // poblado desde el inicio
    expect(activity.description).toBe('Hola');
    expect(activity.category).toBe('música viva');

    // DB: image_url presente; archivo WebP real en disco.
    const row = await db.selectFrom('activities').select(['image_url', 'status']).where('id', '=', activity.id).executeTakeFirstOrThrow();
    expect(row.image_url).toBe(activity.imageUrl);
    const name = activity.imageUrl!.replace('/uploads/', '');
    const meta = await sharp(path.join(uploadsDir, name)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
    expect((await tmpFiles()).length).toBe(0); // cero .tmp-*
  });

  it('owner también crea → 201', async () => {
    expect((await post(await withFile({ name: 'Otra con portada' }), TOK.owner)).statusCode).toBe(201);
  });

  it('imagePosY en el multipart → persiste; inválido → 400; ausente → null', async () => {
    const res = await post(await withFile({ imagePosY: '20' }), TOK.admin);
    expect(res.statusCode).toBe(201);
    expect(ActivityCreateResponseSchema.parse(res.json()).activity.imagePosY).toBe(20);

    expect((await post(await withFile({ imagePosY: '101' }), TOK.admin)).statusCode).toBe(400);

    const sinPos = await post(await withFile(), TOK.admin);
    expect(sinPos.statusCode).toBe(201);
    expect(ActivityCreateResponseSchema.parse(sinPos.json()).activity.imagePosY).toBe(null);
  });

  it('falta portada → 400, sin actividad', async () => {
    const before = await countActs(orgAId);
    const res = await post(fieldParts(), TOK.admin); // sin file
    expect(res.statusCode).toBe(400);
    expect(await countActs(orgAId)).toBe(before);
  });

  it('múltiples archivos → 400, sin actividad', async () => {
    const before = await countActs(orgAId);
    expect((await post(await withFile({}, 2), TOK.admin)).statusCode).toBe(400);
    expect(await countActs(orgAId)).toBe(before);
  });

  it('SVG/GIF/no-imagen → rechazo (415), sin actividad', async () => {
    const before = await countActs(orgAId);
    const svg = [...fieldParts(), { kind: 'file', name: 'cover', filename: 'x.svg', ct: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') } as Part];
    expect((await post(svg, TOK.admin)).statusCode).toBe(415);
    const gif = [...fieldParts(), { kind: 'file', name: 'cover', filename: 'x.gif', ct: 'image/gif', buffer: Buffer.from('GIF89a' + 'x'.repeat(40)) } as Part];
    expect((await post(gif, TOK.admin)).statusCode).toBe(415);
    expect(await countActs(orgAId)).toBe(before);
    expect((await tmpFiles()).length).toBe(0);
  });

  it('archivo > 5MB → 413, sin actividad', async () => {
    const before = await countActs(orgAId);
    const big = Buffer.alloc(6 * 1024 * 1024, 0x89);
    const parts = [...fieldParts(), { kind: 'file', name: 'cover', filename: 'big.png', ct: 'image/png', buffer: big } as Part];
    expect((await post(parts, TOK.admin)).statusCode).toBe(413);
    expect(await countActs(orgAId)).toBe(before);
  });

  it('body inválido (name corto) → 400, sin archivo ni actividad', async () => {
    const before = await countActs(orgAId);
    const filesBefore = (await readdir(uploadsDir)).length;
    expect((await post(await withFile({ name: 'ab' }), TOK.admin)).statusCode).toBe(400);
    expect(await countActs(orgAId)).toBe(before);
    expect((await readdir(uploadsDir)).length).toBe(filesBefore); // no se escribió archivo
    expect((await tmpFiles()).length).toBe(0);
  });

  it('campos prohibidos del cliente (organizationId/status/imageUrl/enrolledCount) → 400', async () => {
    for (const bad of [{ organizationId: orgBId }, { status: 'finalizada' }, { imageUrl: '/uploads/x.webp' }, { enrolledCount: '99' }]) {
      const res = await post(await withFile(bad as Record<string, string>), TOK.admin);
      expect(res.statusCode).toBe(400);
    }
  });

  it('operator → 403; sin cookie → 401; cross-tenant (staff de B en host A) → 403', async () => {
    expect((await post(await withFile({}), TOK.operator)).statusCode).toBe(403);
    expect((await post(await withFile({}))).statusCode).toBe(401);
    expect((await post(await withFile({}), TOK.b)).statusCode).toBe(403);
  });

  it('legacy POST /activities (sin portada) sigue funcionando → 201', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v2/activities',
      headers: { host: hostA, 'content-type': 'application/json', cookie: `contan2_session=${TOK.admin}` },
      payload: { name: 'Legacy sin portada', type: 'cine', location: 'Sala', date: future(7), capacity: 30 },
    });
    expect(res.statusCode).toBe(201);
    expect(ActivityCreateResponseSchema.parse(res.json()).activity.imageUrl).toBe(null);
  });
});

// Unit (sin DB): el rollback de persistCover borra el archivo nuevo si el INSERT
// (update) lanza → garantía de "sin huérfanos" en la que se apoya with-cover.
describe('persistCover · rollback de archivo si el INSERT falla', () => {
  it('update que lanza → archivo borrado, sin .tmp-*', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'wc-rb-'));
    process.env.UPLOADS_DIR = dir;
    const data = await realPng();
    await expect(
      persistCover({ root: dir, data, oldImageUrl: null, update: async () => { throw new Error('DB caída'); } }),
    ).rejects.toThrow();
    const left = await readdir(dir);
    expect(left.filter((f) => f.startsWith('.tmp-')).length).toBe(0);
    expect(left.filter((f) => f.endsWith('.webp')).length).toBe(0); // archivo nuevo borrado
    delete process.env.UPLOADS_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it('update que devuelve null → CoverError update_failed + archivo borrado', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'wc-rb2-'));
    const data = await realPng();
    await expect(
      persistCover({ root: dir, data, oldImageUrl: null, update: async () => null }),
    ).rejects.toBeInstanceOf(CoverError);
    expect((await readdir(dir)).filter((f) => f.endsWith('.webp')).length).toBe(0);
    await rm(dir, { recursive: true, force: true });
  });
});
