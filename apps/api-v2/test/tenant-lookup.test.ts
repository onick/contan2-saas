// apps/api-v2/test/tenant-lookup.test.ts · integration (skip sin DATABASE_URL).
// Login email-first: correo de staff activo → su(s) tenant(s); inactivo u
// org suspendida → fuera; desconocido → lista vacía (200, neutro); inválido
// → 400; rate limit 5/min por IP.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('tenant-lookup · login email-first', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const orgIds: string[] = [];
  const EMAIL = `multi-${stamp}@t.local`;

  let ipSeq = 0;
  const call = (body: unknown, fixedIp = false) =>
    app.inject({
      method: 'POST', url: '/api/v2/public/tenant-lookup',
      headers: {
        host: 'contan2.com',
        'x-forwarded-for': fixedIp ? '10.9.9.9' : `10.8.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`,
        'content-type': 'application/json',
      },
      payload: body as object,
    });

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    for (const [slug, status] of [[`tl-a-${stamp}`, 'active'], [`tl-b-${stamp}`, 'active'], [`tl-c-${stamp}`, 'suspended']] as const) {
      const o = await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status }).returning('id').executeTakeFirstOrThrow();
      orgIds.push(o.id);
      await db.insertInto('staff_members').values({
        organization_id: o.id, email: EMAIL, password_hash: 'x', full_name: 'S',
        status: slug.includes('tl-b') ? 'active' : (status === 'suspended' ? 'active' : 'active'), role: 'admin',
      }).execute();
    }
    // staff suspendido en la org A además del activo
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('staff_members').where('organization_id', 'in', orgIds).execute();
    await db.deleteFrom('organizations').where('id', 'in', orgIds).execute();
    await db.destroy();
  });

  it('correo en varios tenants → lista con ambos ACTIVOS (la org suspendida fuera)', async () => {
    const r = await call({ email: EMAIL.toUpperCase() });
    expect(r.statusCode).toBe(200);
    const tenants = r.json().tenants as Array<{ slug: string; name: string }>;
    expect(tenants.map((t) => t.slug).sort()).toEqual([`tl-a-${stamp}`, `tl-b-${stamp}`].sort());
    // sin ids ni roles
    expect(Object.keys(tenants[0]!).sort()).toEqual(['name', 'slug']);
  });

  it('desconocido → 200 lista vacía (neutro); inválido → 400', async () => {
    expect((await call({ email: `nadie-${stamp}@t.local` })).json().tenants).toEqual([]);
    expect((await call({ email: 'no-es-correo' })).statusCode).toBe(400);
    expect((await call({})).statusCode).toBe(400);
  });

  it('rate limit: 6º intento desde la misma IP → 429', async () => {
    let last = 0;
    for (let i = 0; i < 6; i += 1) {
      last = (await call({ email: `flood-${stamp}@t.local` }, true)).statusCode;
    }
    expect(last).toBe(429);
  });
});
