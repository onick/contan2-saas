// apps/api-v2/test/credentials-png.test.ts · integration (skip sin DATABASE_URL).
// S1 · GET /credentials/:code.png — público bearer-style (paridad v1 + CONTINUIDAD:
// se sirve en /api/v2/... y en la ruta LEGACY /api/... que enlazan los emails ya
// enviados por v1). PNG válido + headers de cache/inline, formato estricto 400,
// no-existe/archivado 404, aislamiento por tenant (código de A en host B → 404).

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('GET /credentials/:code.png (público, nueva + legacy)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `cr-a-${stamp}`;
  const slugB = `cr-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  const hostB = `${slugB}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const CODE = 'CRA-AB12CD';
  const ARCHIVED = 'CRA-ZZ99ZZ';

  const mkOrg = async (slug: string, prefix: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: prefix, primary_color: '#e65100', secondary_color: '#ff6f00' }).returning('id').executeTakeFirstOrThrow()).id;

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA, 'CRA');
    orgBId = await mkOrg(slugB, 'CRB');
    await db.insertInto('users').values({ id: randomUUID(), organization_id: orgAId, code: CODE, first_name: 'Eva', last_name: 'Torres', email: null, phone: null, visit_count: 0 }).execute();
    await db.insertInto('users').values({ id: randomUUID(), organization_id: orgAId, code: ARCHIVED, first_name: 'Archi', last_name: 'Vada', email: null, phone: null, visit_count: 0, deleted_at: new Date().toISOString() }).execute();
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('users').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const get = (path: string, host = hostA) => app.inject({ method: 'GET', url: path, headers: { host } });

  it('ruta NUEVA: PNG válido sin auth + headers de cache/inline', async () => {
    const res = await get(`/api/v2/credentials/${CODE}.png`);
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toBe('image/png');
    expect(String(res.headers['cache-control'])).toContain('max-age=300');
    expect(String(res.headers['content-disposition'])).toContain(`credencial-${CODE}.png`);
    expect(res.rawPayload.subarray(1, 4).toString('latin1')).toBe('PNG'); // magic bytes
  });

  it('ruta LEGACY v1 (/api/credentials/…): sirve el MISMO PNG (continuidad de emails viejos)', async () => {
    const res = await get(`/api/credentials/${CODE}.png`);
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toBe('image/png');
    expect(res.rawPayload.subarray(1, 4).toString('latin1')).toBe('PNG');
  });

  it('case-insensitive en la URL (cra-ab12cd.png → 200)', async () => {
    expect((await get(`/api/v2/credentials/${CODE.toLowerCase()}.png`)).statusCode).toBe(200);
  });

  it('formato inválido → 400; no existe → 404; archivado → 404 (indistinguible)', async () => {
    expect((await get('/api/v2/credentials/hack.png')).statusCode).toBe(400);
    expect((await get('/api/v2/credentials/CRA-NOEXIS.png')).statusCode).toBe(404);
    expect((await get(`/api/v2/credentials/${ARCHIVED}.png`)).statusCode).toBe(404);
  });

  it('aislamiento por tenant: código de A pedido en host B → 404', async () => {
    expect((await get(`/api/v2/credentials/${CODE}.png`, hostB)).statusCode).toBe(404);
  });
});
