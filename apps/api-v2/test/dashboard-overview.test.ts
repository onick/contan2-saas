// apps/api-v2/test/dashboard-overview.test.ts · integration (skip sin DATABASE_URL).
// S2 · GET /dashboard/overview?period= — paridad de definiciones con v1:
// serie diaria local con huecos en 0, deltas vs período anterior (deltaPct v1),
// visitantes nuevos, ocupación promedio, tasa de retorno (visit_count>1),
// upcoming + insight low_enrollment, aislamiento por tenant, 401.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';
import { deltaPct } from '../src/services/dashboard-overview.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

describe('deltaPct (unit, paridad v1)', () => {
  it('prev=0 → 0 si curr=0, 100 si curr>0; resto round(Δ/prev·100)', () => {
    expect(deltaPct(0, 0)).toBe(0);
    expect(deltaPct(5, 0)).toBe(100);
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(50, 100)).toBe(-50);
  });
});

run('GET /dashboard/overview', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `do-a-${stamp}`;
  const slugB = `do-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { admin: `do-adm-${stamp}` };

  const mkOrg = async (slug: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkUser = async (orgId: string, visitCount: number, createdAt?: string) => {
    const code = `TST-${randomUUID().slice(0, 6).toUpperCase()}`;
    const u = await db.insertInto('users').values({
      id: randomUUID(), organization_id: orgId, code, first_name: 'V', last_name: 'T',
      email: `${code.toLowerCase()}@do.do`, phone: null, visit_count: visitCount,
      ...(createdAt ? { created_at: createdAt } : {}),
    }).returning('id').executeTakeFirstOrThrow();
    return u.id;
  };
  const mkActivity = async (orgId: string, name: string, dateIso: string, capacity: number, enrolled: number, status: 'activa' | 'finalizada' = 'activa') =>
    (await db.insertInto('activities').values({ id: randomUUID(), organization_id: orgId, name, type: 'concierto', location: 'Sala', date: dateIso, capacity, enrolled_count: enrolled, status }).returning('id').executeTakeFirstOrThrow()).id;
  const mkAtt = async (orgId: string, activityId: string, userId: string | null, registeredAt: string) =>
    db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, activity_id: activityId, activity_name: 'x',
      user_id: userId, user_code: userId ? 'TST-XXXXXX' : null, anonymous: userId === null,
      companions_children: 0, checked_in_at: registeredAt, registered_at: registeredAt,
    }).execute();

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    const s = await db.insertInto('staff_members').values({ organization_id: orgAId, email: `adm-${stamp}@t.local`, password_hash: 'x', full_name: 'S', status: 'active', role: 'admin' }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(TOK.admin), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();

    // Visitantes: u1 recurrente (3 visitas), u2 nuevo del período (1 visita).
    const u1 = await mkUser(orgAId, 3, ago(60));
    const u2 = await mkUser(orgAId, 1, ago(2));
    // Actividades: una del período actual (7d) ocupada 50%, una del anterior 100%.
    const actNow = await mkActivity(orgAId, 'Del período', ago(2), 10, 5, 'finalizada');
    const actPrev = await mkActivity(orgAId, 'Del anterior', ago(10), 10, 10, 'finalizada');
    // Próxima con baja inscripción (insight): en 3 días, 2/100 (<30%, <14d).
    await mkActivity(orgAId, 'Próxima floja', new Date(Date.now() + 3 * DAY).toISOString(), 100, 2);
    // Asistencias 7d: hoy 2 (u1 returning + anónima), hace 2 días 1 (u2 no-returning).
    await mkAtt(orgAId, actNow, u1, ago(0));
    await mkAtt(orgAId, actNow, null, ago(0));
    await mkAtt(orgAId, actNow, u2, ago(2));
    // Período anterior (7-14d): 1 asistencia returning (otra actividad: unique org+user+act).
    await mkAtt(orgAId, actPrev, u1, ago(9));
    // Tenant B: ruido que NO debe aparecer.
    const ub = await mkUser(orgBId, 5, ago(1));
    const actB = await mkActivity(orgBId, 'B', ago(1), 10, 5);
    await mkAtt(orgBId, actB, ub, ago(0));

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('attendance').where('organization_id', '=', id).execute();
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('users').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const get = (qs = '', token?: string, host = hostA) =>
    app.inject({ method: 'GET', url: `/api/v2/dashboard/overview${qs}`, headers: { host, ...(token ? { cookie: `contan2_session=${token}` } : {}) } });

  it('7d: serie de 7 días con huecos en 0, totales y deltas correctos (solo tenant A)', async () => {
    const res = await get('?period=7d', TOK.admin);
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.period).toBe('7d');
    expect(b.series).toHaveLength(7);
    expect(b.series.reduce((s: number, p: { value: number }) => s + p.value, 0)).toBe(3); // 3 del período (sin tenant B)
    expect(b.attendance).toMatchObject({ current: 3, previous: 1, deltaPct: 200 });
    expect(b.newVisitors.current).toBe(1); // u2 (u1 es de hace 60 días)
    expect(b.avgOccupancyPct.current).toBe(50); // actividad del período 5/10
    expect(b.avgOccupancyPct.previous).toBe(100); // la del anterior 10/10
    // retorno: 1 de 3 asistencias es de un visitante con >1 visita (la anónima no cuenta)
    expect(b.returnRatePct).toMatchObject({ current: 33, previous: 100 });
  });

  it('upcoming + insight low_enrollment (paridad v1: <30% a <14 días)', async () => {
    const b = (await get('?period=7d', TOK.admin)).json();
    expect(b.upcoming.name).toBe('Próxima floja');
    const low = b.insights.find((i: { type: string }) => i.type === 'low_enrollment');
    expect(low).toBeTruthy();
    expect(low.severity).toBe('warning');
    expect(low.message).toContain('2/100');
  });

  it('featured: la de más asistencias del período, con su conteo', async () => {
    const b = (await get('?period=7d', TOK.admin)).json();
    expect(b.featured.name).toBe('Del período');
    expect(b.featured.periodAttendances).toBe(3);
    // topActivities: ranking del período; la #1 coincide con featured.
    expect(b.topActivities.length).toBeGreaterThanOrEqual(1);
    expect(b.topActivities[0].id).toBe(b.featured.id);
    const counts = b.topActivities.map((t: { periodAttendances: number }) => t.periodAttendances);
    expect([...counts].sort((x: number, y: number) => y - x)).toEqual(counts); // orden desc
  });

  it('period inválido cae a 30d; sin sesión → 401', async () => {
    expect((await get('?period=hack', TOK.admin)).json().period).toBe('30d');
    expect((await get('', undefined)).statusCode).toBe(401);
  });
});
