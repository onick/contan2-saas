// apps/api-v2/test/users-archive.test.ts · integration (skip sin DATABASE_URL).
// F2D: archivar/reactivar (soft-delete) + filtro active/archived/all del listado.
// Soft-archive (deleted_at); nunca hard-delete; historial/asistencias preservados.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { UsersListResponseSchema, AdminUserArchiveResponseSchema, UserActivityHistoryResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('users · archivar/reactivar + filtro (F2D)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `arc-a-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  const TOK = { owner: `arc-own-${stamp}`, op: `arc-op-${stamp}` };
  const CODE = 'CCB-ARC001';
  let userId: string;

  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${stamp}@t.local`, password_hash: 'x', full_name: role, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgAId = (await db.insertInto('organizations').values({ slug: slugA, name: slugA, status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.op, 'operator');
    userId = randomUUID();
    await db.insertInto('users').values([
      { id: userId, organization_id: orgAId, code: CODE, first_name: 'Ana', last_name: 'Pérez', email: 'ana@ccb.do', phone: null, visit_count: 1 },
      { id: randomUUID(), organization_id: orgAId, code: 'CCB-ARC002', first_name: 'Otro', last_name: 'Activo', email: 'otro@ccb.do', phone: null, visit_count: 1 },
    ]).execute();
    const actId = randomUUID();
    await db.insertInto('activities').values({ id: actId, organization_id: orgAId, name: 'Acto', type: 'Concierto', location: 'Sala', date: new Date().toISOString(), capacity: 100, status: 'activa' }).execute();
    await db.insertInto('attendance').values({ id: randomUUID(), organization_id: orgAId, user_id: userId, user_code: CODE, activity_id: actId, activity_name: 'Acto', anonymous: false, checked_in_at: new Date().toISOString() }).execute();
    app = buildApp(); await app.ready();
  });
  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('attendance').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgAId).execute();
    await db.destroy();
  });

  const post = (path: string, token = TOK.owner) => app.inject({ method: 'POST', url: path, headers: { host: hostA }, cookies: { contan2_session: token } });
  const list = async (qs = '') => UsersListResponseSchema.parse((await app.inject({ method: 'GET', url: `/api/v2/users${qs}`, headers: { host: hostA }, cookies: { contan2_session: TOK.owner } })).json());

  it('operator 403 al archivar', async () => {
    expect((await post(`/api/v2/users/${CODE}/archive`, TOK.op)).statusCode).toBe(403);
  });

  it('archivar (owner) → 200; sale del listado activo; aparece en archived/all; historial preservado', async () => {
    const res = await post(`/api/v2/users/${CODE}/archive`);
    expect(res.statusCode).toBe(200);
    const body = AdminUserArchiveResponseSchema.parse(res.json());
    expect(body.archived).toBe(true);
    expect(body.deletedAt).not.toBeNull();
    // default (active) ya NO lo incluye
    expect((await list()).items.some((u) => u.code === CODE)).toBe(false);
    // archived sólo archivados
    expect((await list('?status=archived')).items.map((u) => u.code)).toEqual([CODE]);
    // all incluye ambos
    expect((await list('?status=all')).items.some((u) => u.code === CODE)).toBe(true);
    // historial/asistencias intactos (no hard-delete)
    const hist = UserActivityHistoryResponseSchema.parse((await app.inject({ method: 'GET', url: `/api/v2/users/${CODE}/activities`, headers: { host: hostA }, cookies: { contan2_session: TOK.owner } })).json());
    expect(hist.total).toBe(1);
    // la fila sigue en la DB con deleted_at seteado (soft, no DELETE)
    const row = await db.selectFrom('users').select(['deleted_at']).where('id', '=', userId).executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
  });

  it('archivar de nuevo (ya archivado) → 404 (no está activo)', async () => {
    expect((await post(`/api/v2/users/${CODE}/archive`)).statusCode).toBe(404);
  });

  it('reactivar (owner) → 200; vuelve al listado activo', async () => {
    const body = AdminUserArchiveResponseSchema.parse((await post(`/api/v2/users/${CODE}/reactivate`)).json());
    expect(body.archived).toBe(false);
    expect(body.deletedAt).toBeNull();
    expect((await list()).items.some((u) => u.code === CODE)).toBe(true);
  });

  it('reactivar un activo → 404 (no estaba archivado); audit registra ambas acciones', async () => {
    expect((await post(`/api/v2/users/${CODE}/reactivate`)).statusCode).toBe(404);
    const actions = await db.selectFrom('tenant_audit_log').select('action').where('organization_id', '=', orgAId)
      .where('action', 'in', ['user.archived', 'user.reactivated']).execute();
    expect(actions.map((a) => a.action).sort()).toEqual(['user.archived', 'user.reactivated']);
  });
});
