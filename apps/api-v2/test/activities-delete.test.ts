// apps/api-v2/test/activities-delete.test.ts · integration (skip sin DATABASE_URL).
// DELETE /api/v2/activities/:id — hard-delete GUARDADO (paridad v1):
//   sin asistencias → 204 (actividad fuera, audit activity.deleted);
//   con asistencias y NO cancelada → 409 sin tocar nada;
//   cancelada con asistencias → 204 + purga de attendance (visit_count intacto);
//   operator → 403; sin cookie → 401; staff de otro tenant → 403 (guard); inexistente → 404.

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

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

run('DELETE /activities/:id · hard-delete guardado', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `actdel-a-${stamp}`;
  const slugB = `actdel-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { admin: `actdel-admin-${stamp}`, operator: `actdel-oper-${stamp}`, b: `actdel-b-${stamp}` };

  const mkOrg = async (slug: string) => {
    const o = await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active' })
      .returning('id').executeTakeFirstOrThrow();
    return o.id;
  };
  const mkStaff = async (orgId: string, token: string, role: 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@test.local`,
      password_hash: 'x', full_name: `Staff ${role}`, status: 'active', role,
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
  };
  const seedActivity = async (o: { org?: string; status?: 'activa' | 'cancelada' } = {}) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id, organization_id: o.org ?? orgAId, name: 'Para borrar', type: 'concierto',
      location: 'Sala', date: future(5), capacity: 50, enrolled_count: 0,
      status: o.status ?? 'activa', description: '', image_url: null, category: null,
    }).execute();
    return id;
  };
  const seedVisitorWithAttendance = async (activityId: string) => {
    const uid = randomUUID();
    await db.insertInto('users').values({
      id: uid, organization_id: orgAId, code: `CCB-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      first_name: 'Vis', last_name: 'Itante', email: null, phone: null, visit_count: 1,
    } as never).execute();
    await db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgAId, user_id: uid, activity_id: activityId,
      activity_name: 'Para borrar', user_code: null, anonymous: false, companions_children: 0,
    } as never).execute();
    return uid;
  };

  const del = (id: string, token?: string, host = hostA) =>
    app.inject({
      method: 'DELETE', url: `/api/v2/activities/${id}`,
      headers: { host, ...(token ? { cookie: `contan2_session=${token}` } : {}) },
    });
  const exists = async (id: string) =>
    !!(await db.selectFrom('activities').select('id').where('id', '=', id).executeTakeFirst());

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
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('attendance').where('organization_id', '=', id).execute();
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('users').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  it('sin asistencias → 204; la actividad desaparece y queda auditada', async () => {
    const id = await seedActivity();
    const res = await del(id, TOK.admin);
    expect(res.statusCode).toBe(204);
    expect(await exists(id)).toBe(false);
    const audit = await db.selectFrom('tenant_audit_log').select(['action', 'target_id'])
      .where('organization_id', '=', orgAId).where('action', '=', 'activity.deleted')
      .where('target_id', '=', id).executeTakeFirst();
    expect(audit).toBeTruthy();
  });

  it('con asistencias y NO cancelada → 409; nada se borra', async () => {
    const id = await seedActivity({ status: 'activa' });
    await seedVisitorWithAttendance(id);
    const res = await del(id, TOK.admin);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/cancelala primero/i);
    expect(await exists(id)).toBe(true);
  });

  it('cancelada con asistencias → 204; purga attendance y visit_count queda intacto', async () => {
    const id = await seedActivity({ status: 'cancelada' });
    const uid = await seedVisitorWithAttendance(id);
    const res = await del(id, TOK.admin);
    expect(res.statusCode).toBe(204);
    expect(await exists(id)).toBe(false);
    const att = await db.selectFrom('attendance').select('id').where('activity_id', '=', id).executeTakeFirst();
    expect(att).toBeUndefined();
    const u = await db.selectFrom('users').select('visit_count').where('id', '=', uid).executeTakeFirstOrThrow();
    expect(u.visit_count).toBe(1); // paridad v1: la visita histórica no se descuenta
  });

  it('operator → 403; sin cookie → 401; staff de otro tenant → 403; inexistente → 404', async () => {
    const id = await seedActivity();
    expect((await del(id, TOK.operator)).statusCode).toBe(403);
    expect((await del(id)).statusCode).toBe(401);
    expect((await del(id, TOK.b)).statusCode).toBe(403); // staff de B en host A → cross-tenant del guard
    expect((await del(randomUUID(), TOK.admin)).statusCode).toBe(404);
    expect(await exists(id)).toBe(true);
  });
});
