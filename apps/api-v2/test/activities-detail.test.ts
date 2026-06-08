// apps/api-v2/test/activities-detail.test.ts · integration (skip sin DATABASE_URL).
// GET /api/v2/activities/:id (LECTURA · Lifecycle A2). Detalle COMPLETO de una
// actividad del tenant. Cubre: detalle con description/endDate/imageUrl, nulls
// correctos, owner/admin/operator 200, sin sesión 401, cross-tenant 404,
// inexistente 404, respuesta cumple ActivityDetailSchema, organizationId AUSENTE,
// y cero escrituras (counts intactos antes/después).

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { ActivityDetailSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

run('GET /activities/:id · detalle completo', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `actd-a-${stamp}`;
  const slugB = `actd-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = {
    owner: `actd-owner-${stamp}`,
    admin: `actd-admin-${stamp}`,
    operator: `actd-oper-${stamp}`,
    b: `actd-b-${stamp}`,
  };

  const mkOrg = async (slug: string, codePrefix?: string) => {
    const o = await db.insertInto('organizations').values({
      slug, name: `Org ${slug}`, status: 'active', ...(codePrefix ? { code_prefix: codePrefix } : {}),
    }).returning('id').executeTakeFirstOrThrow();
    return o.id;
  };
  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId,
      email: `${role}-${orgId.slice(0, 8)}-${stamp}@test.local`,
      password_hash: 'x', full_name: `Staff ${role}`, status: 'active', role,
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      remember_me: false,
    }).execute();
  };

  interface SeedOpts { org?: string; endDate?: string | null; imageUrl?: string | null; category?: string | null; description?: string; }
  const seed = async (o: SeedOpts = {}) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id,
      organization_id: o.org ?? orgAId,
      name: 'Detalle base', type: 'concierto', location: 'Sala 1',
      date: future(7),
      end_date: o.endDate === undefined ? null : o.endDate,
      capacity: 120, enrolled_count: 33, status: 'activa',
      description: o.description ?? '', image_url: o.imageUrl ?? null, category: o.category ?? null,
    }).execute();
    return id;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA, 'CCB');
    orgBId = await mkOrg(slugB, 'MEM');
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
  });

  const get = (id: string, host: string, token?: string) =>
    app.inject({ method: 'GET', url: `/api/v2/activities/${id}`, headers: { host }, ...(token ? { cookies: { contan2_session: token } } : {}) });

  it('detalle COMPLETO: description/endDate/imageUrl/category presentes', async () => {
    const ed = future(8);
    const id = await seed({ endDate: ed, imageUrl: '/uploads/p.png', category: 'música clásica', description: 'Texto largo del detalle' });
    const res = await get(id, hostA, TOK.admin);
    expect(res.statusCode).toBe(200);
    const d = res.json();
    expect(d.id).toBe(id);
    expect(d.description).toBe('Texto largo del detalle');
    expect(d.endDate).toBe(new Date(ed).toISOString());
    expect(d.imageUrl).toBe('/uploads/p.png');
    expect(d.category).toBe('música clásica');
    expect(d.capacity).toBe(120);
    expect(d.enrolledCount).toBe(33);
    expect(d.status).toBe('activa');
    expect(typeof d.createdAt).toBe('string');
    expect(typeof d.updatedAt).toBe('string');
  });

  it('nulls correctos: endDate/category/imageUrl null', async () => {
    const id = await seed({ endDate: null, category: null, imageUrl: null });
    const d = (await get(id, hostA, TOK.admin)).json();
    expect(d.endDate).toBe(null);
    expect(d.category).toBe(null);
    expect(d.imageUrl).toBe(null);
  });

  it('owner/admin/operator → 200', async () => {
    const id = await seed();
    for (const t of [TOK.owner, TOK.admin, TOK.operator]) {
      expect((await get(id, hostA, t)).statusCode).toBe(200);
    }
  });

  it('sin sesión → 401', async () => {
    const id = await seed();
    expect((await get(id, hostA)).statusCode).toBe(401);
  });

  it('cross-tenant: actividad de orgB sobre host A → 404', async () => {
    const idB = await seed({ org: orgBId });
    expect((await get(idB, hostA, TOK.admin)).statusCode).toBe(404);
  });

  it('inexistente → 404', async () => {
    expect((await get(randomUUID(), hostA, TOK.admin)).statusCode).toBe(404);
  });

  it('la respuesta cumple ActivityDetailSchema y NO expone organizationId', async () => {
    const id = await seed({ endDate: future(9), imageUrl: '/uploads/x.png', category: 'cat', description: 'desc' });
    const body = (await get(id, hostA, TOK.admin)).json();
    expect(() => ActivityDetailSchema.parse(body)).not.toThrow();
    expect(body).not.toHaveProperty('organizationId');
    expect(body).not.toHaveProperty('organization_id');
  });

  it('GET es de LECTURA: cero escrituras (counts intactos)', async () => {
    const id = await seed();
    const before = await db.selectFrom('activities').select(db.fn.countAll<number>().as('n'))
      .where('organization_id', '=', orgAId).executeTakeFirstOrThrow();
    await get(id, hostA, TOK.admin);
    await get(id, hostA, TOK.operator);
    const after = await db.selectFrom('activities').select(db.fn.countAll<number>().as('n'))
      .where('organization_id', '=', orgAId).executeTakeFirstOrThrow();
    expect(Number(after.n)).toBe(Number(before.n));
  });
});
