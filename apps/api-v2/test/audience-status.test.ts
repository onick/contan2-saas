// apps/api-v2/test/audience-status.test.ts · integration (skip sin DATABASE_URL).
// F6b: UNA definición de conteo por estado de audiencia.
//   pendiente  = email + nunca enviada credencial
//   activo     = no pendiente + actividad o created_at en los últimos 90 días
//   inactivo   = resto (no pendiente, sin actividad reciente, alta > 90 días)
//   archivado  = deleted_at not null (fuera de total)
// Invariantes: total = activo+pendiente+inactivo; archivado no suma a total;
// otro tenant no suma; facets.byStatus.total === segments totalVisitors;
// destinatarios bulk noCredential === pendiente.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';
delete process.env.RESEND_API_KEY; // fuerza dry-run

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { UsersFacetsResponseSchema, BulkCredentialsRequestSchema, BulkCredentialsResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';
import { countAudienceByStatus } from '../src/services/users-query.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('F6b audience status', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `aud-a-${stamp}`;
  const slugB = `aud-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  let actId: string;
  const adminToken = `aud-admin-${stamp}`;

  // Helper to create user IDs for cleanup
  const createdUserIds: string[] = [];

  const mkUser = async (orgId: string, over: Record<string, unknown> = {}) => {
    const id = randomUUID();
    const code = `CCB-${id.replace(/-/g, '').slice(0, 6).toUpperCase().replace(/[ILOU]/g, 'X')}`;
    await db.insertInto('users').values({
      id, organization_id: orgId, code, first_name: 'T', last_name: 'U',
      email: null, phone: null, visit_count: 0, ...over,
    } as never).execute();
    createdUserIds.push(id);
    return id;
  };

  const mkAttendance = async (userId: string, orgId: string, over: Record<string, unknown> = {}) => {
    const { code } = await db.selectFrom('users').select('code').where('id', '=', userId).executeTakeFirstOrThrow();
    await db.insertInto('attendance').values({
      id: randomUUID(),
      organization_id: orgId,
      user_id: userId,
      user_code: code,
      activity_id: actId,
      activity_name: 'Acto Test',
      anonymous: false,
      registered_at: new Date().toISOString(),
      checked_in_at: null,
      ...over,
    } as never).execute();
  };

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  const get = (path: string, token: string) =>
    app.inject({
      method: 'GET', url: path,
      headers: { host: hostA },
      cookies: { contan2_session: token },
    });

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgAId = (await db.insertInto('organizations')
      .values({ slug: slugA, name: 'Org A Audience', status: 'active' })
      .returning('id').executeTakeFirstOrThrow()).id;
    orgBId = (await db.insertInto('organizations')
      .values({ slug: slugB, name: 'Org B Audience', status: 'active' })
      .returning('id').executeTakeFirstOrThrow()).id;
    actId = (await db.insertInto('activities').values({
      id: randomUUID(), organization_id: orgAId, name: 'Acto Test', type: 'Conferencia',
      location: 'Sala 1', date: new Date().toISOString(), capacity: 10, status: 'activa',
    }).returning('id').executeTakeFirstOrThrow()).id;
    // Admin for org A
    const staff = await db.insertInto('staff_members').values({
      organization_id: orgAId, email: `admin-${stamp}@test.local`,
      password_hash: 'x', full_name: 'Admin', status: 'active', role: 'admin',
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: staff.id, token_hash: hashToken(adminToken),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('attendance').where('organization_id', 'in', [orgAId, orgBId]).execute();
    if (createdUserIds.length > 0) {
      await db.deleteFrom('users').where('id', 'in', createdUserIds).execute();
    }
    await db.deleteFrom('activities').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
      db.selectFrom('staff_members').select('id').where('organization_id', '=', orgAId)).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('organizations').where('id', 'in', [orgAId, orgBId]).execute();
    await db.destroy();
  });

  it('pendiente: email + credential_sent_at IS NULL', async () => {
    const id = await mkUser(orgAId, { email: `pend-${stamp}@test.local`, credential_sent_at: null });
    const res = await countAudienceByStatus(db, orgAId);
    expect(res.pendiente).toBeGreaterThanOrEqual(1);
    // the one we created is pendiente
    const prev = await countAudienceByStatus(db, orgAId);
    await db.deleteFrom('users').where('id', '=', id).execute();
    createdUserIds.splice(createdUserIds.indexOf(id), 1);
    const after = await countAudienceByStatus(db, orgAId);
    expect(prev.pendiente - after.pendiente).toBe(1);
  });

  it('activo por checked_in_at reciente (< 90 días)', async () => {
    const id = await mkUser(orgAId, {
      email: `activo-chk-${stamp}@test.local`,
      credential_sent_at: daysAgo(5),
    });
    await mkAttendance(id, orgAId, { checked_in_at: daysAgo(10), registered_at: daysAgo(10) });
    const prev = await countAudienceByStatus(db, orgAId);
    await db.deleteFrom('attendance').where('user_id', '=', id).execute();
    await db.deleteFrom('users').where('id', '=', id).execute();
    createdUserIds.splice(createdUserIds.indexOf(id), 1);
    const after = await countAudienceByStatus(db, orgAId);
    expect(prev.activo - after.activo).toBe(1);
  });

  it('activo solo por registered_at (coalesce; checked_in_at NULL)', async () => {
    const id = await mkUser(orgAId, {
      email: `activo-reg-${stamp}@test.local`,
      credential_sent_at: daysAgo(3),
    });
    await mkAttendance(id, orgAId, { checked_in_at: null, registered_at: daysAgo(20) });
    const prev = await countAudienceByStatus(db, orgAId);
    await db.deleteFrom('attendance').where('user_id', '=', id).execute();
    await db.deleteFrom('users').where('id', '=', id).execute();
    createdUserIds.splice(createdUserIds.indexOf(id), 1);
    const after = await countAudienceByStatus(db, orgAId);
    expect(prev.activo - after.activo).toBe(1);
  });

  it('inactivo: última actividad 120 días, alta 130 días', async () => {
    const id = await mkUser(orgAId, {
      email: `inact-${stamp}@test.local`,
      credential_sent_at: daysAgo(100),
      created_at: daysAgo(130),
    });
    await mkAttendance(id, orgAId, { checked_in_at: daysAgo(120), registered_at: daysAgo(120) });
    const prev = await countAudienceByStatus(db, orgAId);
    await db.deleteFrom('attendance').where('user_id', '=', id).execute();
    await db.deleteFrom('users').where('id', '=', id).execute();
    createdUserIds.splice(createdUserIds.indexOf(id), 1);
    const after = await countAudienceByStatus(db, orgAId);
    expect(prev.inactivo - after.inactivo).toBe(1);
  });

  it('activo: creado hace 10 días sin visitas (created_at < 90 días)', async () => {
    const id = await mkUser(orgAId, {
      // sin email → no es pendiente; sin actividad; creado hace 10 días → activo
      email: null,
      created_at: daysAgo(10),
    });
    const prev = await countAudienceByStatus(db, orgAId);
    await db.deleteFrom('users').where('id', '=', id).execute();
    createdUserIds.splice(createdUserIds.indexOf(id), 1);
    const after = await countAudienceByStatus(db, orgAId);
    expect(prev.activo - after.activo).toBe(1);
  });

  it('archivado: deleted_at NOT NULL → fuera del total', async () => {
    const id = await mkUser(orgAId, {
      email: `arch-${stamp}@test.local`,
      deleted_at: daysAgo(2),
    });
    const prev = await countAudienceByStatus(db, orgAId);
    await db.deleteFrom('users').where('id', '=', id).execute();
    createdUserIds.splice(createdUserIds.indexOf(id), 1);
    const after = await countAudienceByStatus(db, orgAId);
    expect(prev.archivado - after.archivado).toBe(1);
    // archivado no cuenta en total
    expect(prev.total).toBe(after.total);
  });

  it('persona de otro tenant: no suma al orgA', async () => {
    const id = await mkUser(orgBId, { email: `other-${stamp}@test.local` });
    const res = await countAudienceByStatus(db, orgAId);
    await db.deleteFrom('users').where('id', '=', id).execute();
    createdUserIds.splice(createdUserIds.indexOf(id), 1);
    const after = await countAudienceByStatus(db, orgAId);
    // counts should be identical (tenant B user didn't affect orgA)
    expect(res.total).toBe(after.total);
    expect(res.pendiente).toBe(after.pendiente);
  });

  it('inactivo: sin email, sin asistencias, creado hace 130 días (regresión NULL)', async () => {
    // Bug: not(NULL) = NULL → usuario caía fuera de todos los estados.
    // Con coalesce(last_activity_at, '-infinity') debe clasificar como inactivo.
    const id = await mkUser(orgAId, {
      email: null,
      created_at: daysAgo(130),
    });
    const prev = await countAudienceByStatus(db, orgAId);
    await db.deleteFrom('users').where('id', '=', id).execute();
    createdUserIds.splice(createdUserIds.indexOf(id), 1);
    const after = await countAudienceByStatus(db, orgAId);
    expect(prev.inactivo - after.inactivo).toBe(1);
  });

  it('invariante: total SQL === activo + pendiente + inactivo (no suma JS)', async () => {
    const res = await countAudienceByStatus(db, orgAId);
    expect(res.total).toBe(res.activo + res.pendiente + res.inactivo);
  });

  it('facets.byStatus incluido en GET /users/facets y total es correcto', async () => {
    const direct = await countAudienceByStatus(db, orgAId);
    const res = await get('/api/v2/users/facets', adminToken);
    expect(res.statusCode).toBe(200);
    const body = UsersFacetsResponseSchema.parse(res.json());
    expect(body.byStatus).toBeDefined();
    expect(body.byStatus!.total).toBe(direct.total);
    expect(body.byStatus!.activo).toBe(direct.activo);
    expect(body.byStatus!.pendiente).toBe(direct.pendiente);
    expect(body.byStatus!.inactivo).toBe(direct.inactivo);
    expect(body.byStatus!.archivado).toBe(direct.archivado);
  });

  it('GET /segments totalVisitors === byStatus.total', async () => {
    const direct = await countAudienceByStatus(db, orgAId);
    const res = await get('/api/v2/segments', adminToken);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { totalVisitors: number };
    expect(body.totalVisitors).toBe(direct.total);
  });

  it('destinatarios bulk noCredential === pendiente', async () => {
    // Crea ≥2 pendientes + 1 ya enviada para control exacto
    const t = Date.now();
    await mkUser(orgAId, { email: `bulk-p1-${t}@test.local`, credential_sent_at: null });
    await mkUser(orgAId, { email: `bulk-p2-${t}@test.local`, credential_sent_at: null });
    await mkUser(orgAId, { email: `bulk-sent-${t}@test.local`, credential_sent_at: daysAgo(1) });

    const { pendiente } = await countAudienceByStatus(db, orgAId);
    expect(pendiente).toBeGreaterThanOrEqual(2);

    const bulkRes = await app.inject({
      method: 'POST', url: '/api/v2/credentials/bulk-send',
      headers: { host: hostA, 'content-type': 'application/json' },
      cookies: { contan2_session: adminToken },
      payload: { cohort: 'noCredential', throttleMs: 0 },
    });
    expect(bulkRes.statusCode).toBe(200);
    const body = BulkCredentialsResponseSchema.parse(bulkRes.json());
    expect(body.results.length).toBe(pendiente);
  });
});
