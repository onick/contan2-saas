// apps/api-v2/test/programs.test.ts · integration (skip sin DATABASE_URL).
// GET/POST /programs: vocabulario por tenant, edición derivada del año, roles,
// idempotencia por slug, tenant-scope.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('GET/POST /programs', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `prog-a-${stamp}`;
  const slugB = `prog-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { admin: `prog-adm-${stamp}`, operator: `prog-ope-${stamp}`, b: `prog-b-${stamp}` };

  const mkOrg = async (slug: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
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
      await db.deleteFrom('programs').where('organization_id', '=', id).execute();
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const post = (body: unknown, token?: string, host = hostA) =>
    app.inject({ method: 'POST', url: '/api/v2/programs', headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, payload: body });
  const get = (qs = '', token?: string, host = hostA) =>
    app.inject({ method: 'GET', url: `/api/v2/programs${qs}`, headers: { host, ...(token ? { cookie: `contan2_session=${token}` } : {}) } });

  it('crea un ciclo (admin) y GET devuelve la edición derivada del año', async () => {
    const res = await post({ name: 'Cine Dominicano', isCyclical: true, editionAnchorYear: 2026, editionAnchorNumber: 5 }, TOK.admin);
    expect(res.statusCode).toBe(201);
    expect(res.json().program).toMatchObject({ name: 'Cine Dominicano', slug: 'cine-dominicano', isCyclical: true });

    const g26 = await get('?year=2026', TOK.admin);
    const p26 = g26.json().programs.find((p: { slug: string }) => p.slug === 'cine-dominicano');
    expect(p26).toMatchObject({ edition: 5, editionLabel: '5to ciclo' });

    const g27 = await get('?year=2027', TOK.admin);
    const p27 = g27.json().programs.find((p: { slug: string }) => p.slug === 'cine-dominicano');
    expect(p27).toMatchObject({ edition: 6, editionLabel: '6to ciclo' });
  });

  it('programa fijo (no cíclico) no trae edición', async () => {
    const res = await post({ name: 'Cine Clásico' }, TOK.admin);
    expect(res.statusCode).toBe(201);
    const g = await get('?year=2026', TOK.admin);
    const p = g.json().programs.find((x: { slug: string }) => x.slug === 'cine-clasico');
    expect(p).toMatchObject({ isCyclical: false });
    expect(p.editionLabel ?? null).toBeNull();
  });

  it('idempotente por slug: recrear "Cine Dominicano" devuelve el existente (200)', async () => {
    const res = await post({ name: 'cine  dominicano' }, TOK.admin); // mismo slug, distinto casing/espacios
    expect(res.statusCode).toBe(200);
    expect(res.json().program.slug).toBe('cine-dominicano');
  });

  it('validación: nombre vacío → 400; cíclico sin ancla → 400', async () => {
    expect((await post({ name: '   ' }, TOK.admin)).statusCode).toBe(400);
    expect((await post({ name: 'Ciclo X', isCyclical: true }, TOK.admin)).statusCode).toBe(400);
  });

  it('roles: operator POST → 403; sin sesión → 401; cross-tenant → 403; GET cualquier staff', async () => {
    expect((await post({ name: 'No debería' }, TOK.operator)).statusCode).toBe(403);
    expect((await post({ name: 'No debería' })).statusCode).toBe(401);
    expect((await post({ name: 'No debería' }, TOK.b)).statusCode).toBe(403);
    expect((await get('?year=2026', TOK.operator)).statusCode).toBe(200); // operator puede LEER
    // tenant B no ve los programas de A.
    expect((await get('?year=2026', TOK.b, `${slugB}.contan2.com`)).json().programs.length).toBe(0);
  });
});
