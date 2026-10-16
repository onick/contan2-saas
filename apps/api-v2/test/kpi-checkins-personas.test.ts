// apps/api-v2/test/kpi-checkins-personas.test.ts · integration (skip sin DATABASE_URL).
// Decisión 6.5: "check-ins hoy" = PERSONAS (filas con check-in + acompañantes) y
// `registros` = filas, idéntico en checkin/metrics, shell/summary y dashboard/overview.
// Escenario: 3 check-ins (uno con 2 acompañantes) + 1 reserva (sin check-in) → personas 5, registros 3.

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

run('KPI check-ins hoy · personas vs registros', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `kpi-${stamp}`;
  const host = `${slug}.contan2.com`;
  const TOK = `kpi-adm-${stamp}`;
  let orgId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgId = (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST' }).returning('id').executeTakeFirstOrThrow()).id;
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `adm-${stamp}@t.local`, password_hash: 'x', full_name: 'S', status: 'active', role: 'admin' }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(TOK), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    const act = (await db.insertInto('activities').values({ id: randomUUID(), organization_id: orgId, name: 'A', type: 'concierto', location: 'Sala', date: new Date().toISOString(), capacity: 50, enrolled_count: 0, status: 'activa' }).returning('id').executeTakeFirstOrThrow()).id;
    const now = new Date().toISOString();
    const mkUser = async () => (await db.insertInto('users').values({
      id: randomUUID(), organization_id: orgId, code: `TST-${randomUUID().slice(0, 6).toUpperCase()}`,
      first_name: 'V', last_name: 'T', email: `${randomUUID().slice(0, 8)}@kpi.do`, phone: null, visit_count: 1,
    }).returning('id').executeTakeFirstOrThrow()).id;
    const mkAtt = async (userId: string | null, children: number, adults: number, hold = false) =>
      db.insertInto('attendance').values({
        id: randomUUID(), organization_id: orgId, activity_id: act, activity_name: 'x',
        user_id: userId, user_code: userId ? 'TST-XXXXXX' : null, anonymous: userId === null,
        companions_children: children, companions_adults: adults,
        checked_in_at: hold ? null : now, registered_at: now,
      }).execute();
    await mkAtt(await mkUser(), 1, 1); // +2 acompañantes
    await mkAtt(await mkUser(), 0, 0);
    await mkAtt(null, 0, 0);
    await mkAtt(await mkUser(), 3, 0, true); // reserva: NO cuenta
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (orgId) {
      await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    }
    await db.destroy();
  });

  const get = (url: string) => app.inject({ method: 'GET', url: `/api/v2${url}`, headers: { host, cookie: `contan2_session=${TOK}` } });

  it('checkin/metrics: personas 5, registros 3', async () => {
    const b = (await get('/checkin/metrics')).json();
    expect(b.metrics.checkinsToday).toBe(5);
    expect(b.metrics.checkinsTodayRecords).toBe(3);
  });

  it('shell/summary (badge): personas 5, registros 3', async () => {
    const b = (await get('/shell/summary')).json();
    expect(b.badges.checkinsToday).toBe(5);
    expect(b.badges.checkinsTodayRecords).toBe(3);
  });

  it('dashboard/overview?period=today: asistencias = personas 5, records 3', async () => {
    const b = (await get('/dashboard/overview?period=today')).json();
    expect(b.attendance.current).toBe(5);
    expect(b.attendance.records).toBe(3);
    expect(b.series.reduce((s: number, p: { value: number }) => s + p.value, 0)).toBe(5);
  });
});
