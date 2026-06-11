// apps/api-v2/test/attendance-delete.test.ts · integration (skip sin DATABASE_URL).
// DELETE /attendance/:id: owner/admin; devuelve cupo por partySize (1+niños,
// mejora sobre v1 que devolvía 1); piso 0; operator 403; ajeno/inexistente 404;
// audit attendance.deleted.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('DELETE /attendance/:id', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `attdel-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { admin: `attdel-adm-${stamp}`, operator: `attdel-op-${stamp}` };

  const mkStaff = async (org: string, token: string, role: 'admin' | 'operator') => {
    const st = await db.insertInto('staff_members').values({
      organization_id: org, email: `${role}-${stamp}@t.local`, password_hash: 'x',
      full_name: 'S', status: 'active', role,
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: st.id, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
  };
  const mkAct = async (org: string, enrolled: number) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id, organization_id: org, name: 'A', type: 'cine', location: 'S',
      date: new Date(Date.now() + 86_400_000).toISOString(), capacity: 50,
      enrolled_count: enrolled, status: 'activa', description: '', image_url: null, category: null,
    }).execute();
    return id;
  };
  const mkAtt = async (org: string, act: string, companions = 0) => {
    const r = await db.insertInto('attendance').values({
      id: randomUUID(), organization_id: org, user_id: null, activity_id: act,
      activity_name: 'A', user_code: null, anonymous: true, companions_children: companions,
    } as never).returning('id').executeTakeFirstOrThrow();
    return r.id;
  };
  let ipSeq = 0;
  const del = (id: string, token?: string) => app.inject({
    method: 'DELETE', url: `/api/v2/attendance/${id}`,
    headers: { host: hostA, 'x-forwarded-for': `10.3.0.${(ipSeq++ % 250) + 1}`, ...(token ? { cookie: `contan2_session=${token}` } : {}) },
  });

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = (await db.insertInto('organizations').values({ slug: slugA, name: 'A', status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
    orgBId = (await db.insertInto('organizations').values({ slug: `attdel-b-${stamp}`, name: 'B', status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('attendance').where('organization_id', '=', id).execute();
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
        db.selectFrom('staff_members').select('id').where('organization_id', '=', id)).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  it('devuelve el cupo por partySize (1+2 niños = 3) y audita', async () => {
    const act = await mkAct(orgAId, 10);
    const att = await mkAtt(orgAId, act, 2);
    expect((await del(att, TOK.admin)).statusCode).toBe(204);
    const a = await db.selectFrom('activities').select('enrolled_count').where('id', '=', act).executeTakeFirstOrThrow();
    expect(a.enrolled_count).toBe(7); // 10 - 3
    const audit = await db.selectFrom('tenant_audit_log').select('id')
      .where('organization_id', '=', orgAId).where('action', '=', 'attendance.deleted').execute();
    expect(audit.length).toBe(1);
  });

  it('piso en 0 (enrolled no queda negativo)', async () => {
    const act = await mkAct(orgAId, 1);
    const att = await mkAtt(orgAId, act, 4); // partySize 5 > enrolled 1
    expect((await del(att, TOK.admin)).statusCode).toBe(204);
    const a = await db.selectFrom('activities').select('enrolled_count').where('id', '=', act).executeTakeFirstOrThrow();
    expect(a.enrolled_count).toBe(0);
  });

  it('operator 403; sin cookie 401; de OTRO tenant 404; inexistente 404', async () => {
    const act = await mkAct(orgAId, 5);
    const att = await mkAtt(orgAId, act);
    expect((await del(att, TOK.operator)).statusCode).toBe(403);
    expect((await del(att)).statusCode).toBe(401);
    const actB = await mkAct(orgBId, 5);
    const attB = await mkAtt(orgBId, actB);
    expect((await del(attB, TOK.admin)).statusCode).toBe(404); // org-scoped
    expect((await del(randomUUID(), TOK.admin)).statusCode).toBe(404);
  });
});
