// apps/api-v2/test/org-branding.test.ts · integration (skip sin DATABASE_URL).
// Self-contained: inserta 2 orgs activas + 1 suspendida, staff + sesiones,
// y ejercita el endpoint con distintos Host + cookies.

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('GET /api/v2/org/branding', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `pr4a-${stamp}`;
  const slugB = `pr4b-${stamp}`;
  const slugC = `pr4c-${stamp}`; // suspendida
  let orgAId: string;
  let orgBId: string;
  let orgCId: string;

  const TOK = { a: `pr4-tok-a-${stamp}`, b: `pr4-tok-b-${stamp}`, c: `pr4-tok-c-${stamp}` };
  const hostA = `${slugA}.contan2.com`;
  const hostB = `${slugB}.contan2.com`;
  const hostC = `${slugC}.contan2.com`;

  const mkOrg = async (slug: string, status: 'active' | 'suspended') => {
    const o = await db
      .insertInto('organizations')
      .values({ slug, name: `Org ${slug}`, status })
      .returning('id')
      .executeTakeFirstOrThrow();
    return o.id;
  };
  const mkStaffWithSession = async (orgId: string, token: string) => {
    const s = await db
      .insertInto('staff_members')
      .values({
        organization_id: orgId,
        email: `staff-${orgId.slice(0, 8)}-${stamp}@test.local`,
        password_hash: 'x',
        full_name: 'PR4 Staff',
        status: 'active',
        role: 'admin',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      remember_me: false,
    }).execute();
    return s.id;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA, 'active');
    orgBId = await mkOrg(slugB, 'active');
    orgCId = await mkOrg(slugC, 'suspended');
    await mkStaffWithSession(orgAId, TOK.a);
    await mkStaffWithSession(orgBId, TOK.b);
    await mkStaffWithSession(orgCId, TOK.c);
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId, orgCId]) {
      if (id) {
        await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
        await db.deleteFrom('organizations').where('id', '=', id).execute();
      }
    }
    await db.destroy();
  });

  const get = (host: string, token?: string) =>
    app.inject({
      method: 'GET',
      url: '/api/v2/org/branding',
      headers: { host },
      ...(token ? { cookies: { contan2_session: token } } : {}),
    });

  it('tenant válido + staff de esa org → 200 + branding', async () => {
    const res = await get(hostA, TOK.a);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { organization: Record<string, unknown> };
    expect(body.organization.id).toBe(orgAId);
    expect(body.organization.slug).toBe(slugA);
    expect(body.organization.sidebarTheme).toBe('brand');
    expect(body.organization.status).toBe('active');
  });

  it('payload shape · 9 keys exactas', async () => {
    const res = await get(hostA, TOK.a);
    const body = res.json() as { organization: Record<string, unknown> };
    expect(Object.keys(body.organization).sort()).toEqual([
      'emailLogoUrl', 'id', 'logoUrl', 'name', 'primaryColor',
      'secondaryColor', 'sidebarTheme', 'slug', 'status',
    ]);
  });

  it('sin cookie → 401', async () => {
    const res = await get(hostA);
    expect(res.statusCode).toBe(401);
  });

  it('cookie inválida → 401', async () => {
    const res = await get(hostA, 'no-such-token');
    expect(res.statusCode).toBe(401);
  });

  it('tenant inexistente → 404', async () => {
    const res = await get(`nope-${stamp}.contan2.com`, TOK.a);
    expect(res.statusCode).toBe(404);
  });

  it('admin.contan2.com no es tenant → 404', async () => {
    const res = await get('admin.contan2.com', TOK.a);
    expect(res.statusCode).toBe(404);
  });

  it('staff de otra org (orgB) sobre tenant A → 403', async () => {
    const res = await get(hostA, TOK.b);
    expect(res.statusCode).toBe(403);
  });

  it('org suspendida → 503 (tenant antes que auth)', async () => {
    const res = await get(hostC, TOK.c);
    expect(res.statusCode).toBe(503);
  });
});
