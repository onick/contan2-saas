// apps/api-v2/test/activities-cover.test.ts · integration (skip sin DATABASE_URL).
// POST /api/v2/activities/:id/cover + serving GET /uploads/:name. Usa un
// UPLOADS_DIR temporal (lo crea/limpia) → no toca volúmenes reales. Cubre auth,
// roles, aislamiento por tenant, validación por magic-bytes, persistencia,
// reemplazo v2/legacy, path-traversal y serving con headers seguros.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, stat, readFile } from 'node:fs/promises';
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

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

// Imágenes reales generadas con sharp (no fixtures en disco).
const realPng = () => sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 80, b: 0 } } }).png().toBuffer();
const realJpeg = () => sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 100, b: 200 } } }).jpeg().toBuffer();

function multipart(buffer: Buffer, filename: string, contentType: string) {
  const boundary = '----cover' + randomUUID().replace(/-/g, '');
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([pre, buffer, post]), ct: `multipart/form-data; boundary=${boundary}` };
}

run('POST /activities/:id/cover · escritura de portada', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  let uploadsDir: string;

  const stamp = Date.now();
  const slugA = `cov-a-${stamp}`;
  const slugB = `cov-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { owner: `cov-own-${stamp}`, admin: `cov-adm-${stamp}`, operator: `cov-ope-${stamp}`, b: `cov-b-${stamp}` };
  let actA: string;   // actividad de A para subir portada
  let actB: string;   // actividad de B (cross-tenant)

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
  const mkActivity = async (orgId: string) =>
    (await db.insertInto('activities').values({
      id: randomUUID(), organization_id: orgId, name: 'Portada test', type: 'concierto',
      location: 'Sala', date: new Date(Date.now() + 7 * 86_400_000).toISOString(), capacity: 50, status: 'activa',
    }).returning('id').executeTakeFirstOrThrow()).id;

  beforeAll(async () => {
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'cov-uploads-'));
    process.env.UPLOADS_DIR = uploadsDir;
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');
    actA = await mkActivity(orgAId);
    actB = await mkActivity(orgBId);
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

  const postCover = (id: string, mp: { payload: Buffer; ct: string }, token?: string, host = hostA) =>
    app.inject({
      method: 'POST', url: `/api/v2/activities/${id}/cover`,
      headers: { host, 'content-type': mp.ct, ...(token ? { cookie: `contan2_session=${token}` } : {}) },
      payload: mp.payload,
    });
  const imageUrlOf = async (id: string) =>
    (await db.selectFrom('activities').select('image_url').where('id', '=', id).executeTakeFirstOrThrow()).image_url;

  it('admin sube PNG válido → 200, image_url v2 persistido, archivo WebP 1600×900 en disco', async () => {
    expect(await imageUrlOf(actA)).toBe(null); // crear sin portada funciona (baseline)
    const res = await postCover(actA, multipart(await realPng(), 'foto.png', 'image/png'), TOK.admin);
    expect(res.statusCode).toBe(200);
    const { activity } = ActivityCreateResponseSchema.parse(res.json());
    expect(activity.imageUrl).toMatch(/^\/uploads\/v2-activity-[0-9a-f-]{36}\.webp$/);
    expect(await imageUrlOf(actA)).toBe(activity.imageUrl);
    const name = activity.imageUrl!.replace('/uploads/', '');
    const onDisk = await readFile(path.join(uploadsDir, name));
    const meta = await sharp(onDisk).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(900);
  });

  it('MIME falso (PNG real con content-type image/jpeg) → 200 (decide por bytes)', async () => {
    const res = await postCover(actA, multipart(await realPng(), 'x.jpg', 'image/jpeg'), TOK.admin);
    expect(res.statusCode).toBe(200);
  });

  it('JPEG real válido → 200', async () => {
    const res = await postCover(actA, multipart(await realJpeg(), 'x.jpg', 'image/jpeg'), TOK.admin);
    expect(res.statusCode).toBe(200);
  });

  it('SVG → 415; GIF → 415; bytes basura → 415', async () => {
    expect((await postCover(actA, multipart(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'x.svg', 'image/svg+xml'), TOK.admin)).statusCode).toBe(415);
    expect((await postCover(actA, multipart(Buffer.from('GIF89a' + 'x'.repeat(50)), 'x.gif', 'image/gif'), TOK.admin)).statusCode).toBe(415);
    expect((await postCover(actA, multipart(Buffer.from('totally not an image'), 'x.png', 'image/png'), TOK.admin)).statusCode).toBe(415);
  });

  it('archivo > 5MB → 413', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    const res = await postCover(actA, multipart(big, 'big.png', 'image/png'), TOK.admin);
    expect(res.statusCode).toBe(413);
  });

  it('sin cookie → 401', async () => {
    expect((await postCover(actA, multipart(await realPng(), 'x.png', 'image/png'))).statusCode).toBe(401);
  });

  it('operator → 403', async () => {
    expect((await postCover(actA, multipart(await realPng(), 'x.png', 'image/png'), TOK.operator)).statusCode).toBe(403);
  });

  it('cross-tenant: actividad de B sobre host A → 404', async () => {
    expect((await postCover(actB, multipart(await realPng(), 'x.png', 'image/png'), TOK.admin)).statusCode).toBe(404);
  });

  it('id inexistente → 404', async () => {
    expect((await postCover(randomUUID(), multipart(await realPng(), 'x.png', 'image/png'), TOK.admin)).statusCode).toBe(404);
  });

  it('reemplazo v2: borra el archivo v2 anterior tras el éxito', async () => {
    const a = await mkActivity(orgAId);
    const r1 = ActivityCreateResponseSchema.parse((await postCover(a, multipart(await realPng(), '1.png', 'image/png'), TOK.owner)).json());
    const name1 = r1.activity.imageUrl!.replace('/uploads/', '');
    expect((await stat(path.join(uploadsDir, name1))).isFile()).toBe(true);
    const r2 = ActivityCreateResponseSchema.parse((await postCover(a, multipart(await realJpeg(), '2.jpg', 'image/jpeg'), TOK.owner)).json());
    const name2 = r2.activity.imageUrl!.replace('/uploads/', '');
    expect(name2).not.toBe(name1);
    await expect(stat(path.join(uploadsDir, name1))).rejects.toBeTruthy(); // anterior v2 borrado
    expect((await stat(path.join(uploadsDir, name2))).isFile()).toBe(true);
  });

  it('reemplazo de portada LEGACY: NO borra el archivo legacy', async () => {
    const a = await mkActivity(orgAId);
    const legacyName = `1779905000000-${randomUUID().slice(0, 12)}.png`;
    await writeFile(path.join(uploadsDir, legacyName), Buffer.from('legacy-keep'));
    await db.updateTable('activities').set({ image_url: `/uploads/${legacyName}` }).where('id', '=', a).execute();
    const res = await postCover(a, multipart(await realPng(), 'new.png', 'image/png'), TOK.admin);
    expect(res.statusCode).toBe(200);
    expect((await stat(path.join(uploadsDir, legacyName))).isFile()).toBe(true); // legacy preservado
  });

  it('serving: GET /uploads/:name → 200 + image/webp + nosniff; traversal → 404', async () => {
    const r = ActivityCreateResponseSchema.parse((await postCover(await mkActivity(orgAId).then((a) => a), multipart(await realPng(), 's.png', 'image/png'), TOK.admin)).json());
    const name = r.activity.imageUrl!.replace('/uploads/', '');
    const ok = await app.inject({ method: 'GET', url: `/uploads/${name}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/webp');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(String(ok.headers['cache-control'])).toContain('immutable');

    const bad = await app.inject({ method: 'GET', url: `/uploads/${encodeURIComponent('../../etc/passwd')}` });
    expect(bad.statusCode).toBe(404);
  });
});
