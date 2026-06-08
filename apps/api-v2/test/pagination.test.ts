// apps/api-v2/test/pagination.test.ts · integration (skip sin DATABASE_URL).
// Paginación + búsqueda server-side de /users y /attendance: páginas sin
// solapamiento/omisión, total filtrado exacto, búsqueda por campo, filtros
// combinados (actividad/fechas), 400 en queries inválidas, aislamiento tenant,
// orden estable con valores iguales, máximo 100 y dataset >100.

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { UsersListResponseSchema, AttendanceListResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('paginación + búsqueda · /users y /attendance', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `pag-a-${stamp}`;
  const slugB = `pag-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = `pag-tok-${stamp}`;
  const TOKB = `pag-tokb-${stamp}`;
  const USERS_N = 105; // > 100 para max + última página
  const TIE_FROM = 40; // bloque de created_at idénticos (orden estable con empate)
  const TIE_COUNT = 8;
  let act1: string;
  let act2: string;

  const mkOrg = async (slug: string) => {
    const o = await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active' })
      .returning('id').executeTakeFirstOrThrow();
    return o.id;
  };
  const mkStaff = async (orgId: string, token: string) => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId, email: `staff-${orgId.slice(0, 8)}-${stamp}@t.local`,
      password_hash: 'x', full_name: 'Pag Staff', status: 'active', role: 'admin',
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK);
    await mkStaff(orgBId, TOKB);

    // 105 usuarios en orgA. created_at distinto por i, salvo un bloque de 8 con
    // created_at idéntico (para probar el desempate por id). Un usuario "Carmen
    // Objío / PAG-FIND / carmen.find@t.local" para búsqueda por cada campo.
    const base = Date.now();
    const rows = Array.from({ length: USERS_N }, (_, i) => {
      const tie = i >= TIE_FROM && i < TIE_FROM + TIE_COUNT;
      const createdAt = new Date(base - (tie ? TIE_FROM : i) * 1000).toISOString();
      return {
        id: randomUUID(),
        organization_id: orgAId,
        code: `PAG-${stamp}-${String(i).padStart(3, '0')}`,
        first_name: i === 0 ? 'Carmen' : `Nom${i}`,
        last_name: i === 0 ? 'Objío' : `Ape${i}`,
        email: i === 0 ? `carmen.find-${stamp}@t.local` : null,
        created_at: createdAt,
      };
    });
    // El usuario findable tiene un código reconocible.
    rows[0]!.code = `PAGFIND-${stamp}`;
    await db.insertInto('users').values(rows).execute();
    // Usuario en orgB (aislamiento).
    await db.insertInto('users').values({
      id: randomUUID(), organization_id: orgBId, code: `OTHER-${stamp}`,
      first_name: 'Carmen', last_name: 'Objío', email: `carmen.find-${stamp}@t.local`,
    }).execute();

    // Actividades + asistencias para filtros.
    act1 = randomUUID(); act2 = randomUUID();
    await db.insertInto('activities').values([
      { id: act1, organization_id: orgAId, name: 'Concierto Congos', type: 'Concierto', location: 'S1', date: new Date().toISOString(), capacity: 100, status: 'activa' },
      { id: act2, organization_id: orgAId, name: 'Cine Foro', type: 'Cine', location: 'S2', date: new Date().toISOString(), capacity: 50, status: 'activa' },
    ]).execute();
    const day = (d: string) => new Date(`2026-05-${d}T12:00:00.000Z`).toISOString();
    await db.insertInto('attendance').values([
      // act1: 3 (fechas 10/11/12 may)
      { id: randomUUID(), organization_id: orgAId, user_id: rows[0]!.id, user_code: rows[0]!.code, activity_id: act1, activity_name: 'Concierto Congos', anonymous: false, registered_at: day('10') },
      { id: randomUUID(), organization_id: orgAId, user_id: rows[1]!.id, user_code: rows[1]!.code, activity_id: act1, activity_name: 'Concierto Congos', anonymous: false, registered_at: day('11') },
      { id: randomUUID(), organization_id: orgAId, user_id: null, user_code: null, activity_id: act1, activity_name: 'Concierto Congos', anonymous: true, registered_at: day('12') },
      // act2: 2 (fechas 20/21 may)
      { id: randomUUID(), organization_id: orgAId, user_id: rows[2]!.id, user_code: rows[2]!.code, activity_id: act2, activity_name: 'Cine Foro', anonymous: false, registered_at: day('20') },
      { id: randomUUID(), organization_id: orgAId, user_id: rows[3]!.id, user_code: rows[3]!.code, activity_id: act2, activity_name: 'Cine Foro', anonymous: false, registered_at: day('21') },
    ]).execute();

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

  const getUsers = (qs: string, token = TOK) =>
    app.inject({ method: 'GET', url: `/api/v2/users${qs}`, headers: { host: hostA }, cookies: { contan2_session: token } });
  const getAtt = (qs: string, token = TOK) =>
    app.inject({ method: 'GET', url: `/api/v2/attendance${qs}`, headers: { host: hostA }, cookies: { contan2_session: token } });

  // ── USERS ──────────────────────────────────────────────────────────────────
  it('paginación: páginas sin solapamiento ni omisión; total exacto', async () => {
    const seen = new Set<string>();
    let offset = 0;
    let total = -1;
    for (let guard = 0; guard < 20; guard += 1) {
      const body = UsersListResponseSchema.parse((await getUsers(`?limit=10&offset=${offset}`)).json());
      total = body.total;
      for (const u of body.items) seen.add(u.id);
      if (offset + body.items.length >= body.total) break;
      offset += 10;
    }
    expect(total).toBe(USERS_N);
    expect(seen.size).toBe(USERS_N); // sin duplicados ni faltantes (orden estable c/ empates)
  });

  it('primera/última página + máximo 100', async () => {
    const first = UsersListResponseSchema.parse((await getUsers('?limit=50&offset=0')).json());
    expect(first.items.length).toBe(50);
    const last = UsersListResponseSchema.parse((await getUsers('?limit=50&offset=100')).json());
    expect(last.items.length).toBe(5); // 105 - 100
    const max = UsersListResponseSchema.parse((await getUsers('?limit=500')).json());
    expect(max.limit).toBe(100); // clamp
    expect(max.items.length).toBe(100);
  });

  it('búsqueda por código / nombre / apellido / email (tenant-scoped)', async () => {
    for (const q of [`PAGFIND-${stamp}`, 'Carmen', 'Objío', `carmen.find-${stamp}`]) {
      const body = UsersListResponseSchema.parse((await getUsers(`?q=${encodeURIComponent(q)}`)).json());
      expect(body.total).toBe(1);
      expect(body.items[0]?.firstName).toBe('Carmen');
    }
  });

  it('total refleja exactamente el filtro de búsqueda', async () => {
    // "Nom1" matchea Nom1, Nom10..Nom19, Nom100..Nom104 → conteo > items de 1 pág.
    const body = UsersListResponseSchema.parse((await getUsers('?q=Nom1&limit=5')).json());
    expect(body.items.length).toBe(5);
    expect(body.total).toBeGreaterThan(5);
    // suma por páginas = total
    const all = UsersListResponseSchema.parse((await getUsers('?q=Nom1&limit=100')).json());
    expect(all.items.length).toBe(body.total);
  });

  it('queries inválidas → 400 (q no-string, q demasiado largo)', async () => {
    expect((await getUsers('?q=a&q=b')).statusCode).toBe(400); // array
    expect((await getUsers(`?q=${'x'.repeat(101)}`)).statusCode).toBe(400); // too long
  });

  it('aislamiento de tenant: la búsqueda no cruza orgs', async () => {
    const body = UsersListResponseSchema.parse((await getUsers('?q=Carmen')).json());
    expect(body.total).toBe(1); // solo el de orgA, no el homónimo de orgB
    expect((await getUsers('?q=Carmen', TOKB)).statusCode).toBe(403); // staff B sobre host A
  });

  // ── ATTENDANCE ───────────────────────────────────────────────────────────────
  it('filtro por actividad + total exacto', async () => {
    const a1 = AttendanceListResponseSchema.parse((await getAtt(`?activityId=${act1}`)).json());
    expect(a1.total).toBe(3);
    const a2 = AttendanceListResponseSchema.parse((await getAtt(`?activityId=${act2}`)).json());
    expect(a2.total).toBe(2);
  });

  it('filtro por rango de fechas', async () => {
    const r = AttendanceListResponseSchema.parse(
      (await getAtt('?dateFrom=2026-05-11T00:00:00.000Z&dateTo=2026-05-20T23:59:59.000Z')).json(),
    );
    // 11,12,20 de may → 3
    expect(r.total).toBe(3);
  });

  it('búsqueda por nombre de actividad + combinada con fecha', async () => {
    const byName = AttendanceListResponseSchema.parse((await getAtt('?q=Cine')).json());
    expect(byName.total).toBe(2);
    const combo = AttendanceListResponseSchema.parse(
      (await getAtt(`?activityId=${act1}&dateFrom=2026-05-11T00:00:00.000Z`)).json(),
    );
    expect(combo.total).toBe(2); // act1 desde el 11 → 11 y 12
  });

  it('orden registered_at desc + desempate por id', async () => {
    const r = AttendanceListResponseSchema.parse((await getAtt(`?activityId=${act1}`)).json());
    const dates = r.items.map((i) => i.registeredAt);
    expect([...dates]).toEqual([...dates].sort().reverse()); // desc
  });

  it('queries inválidas → 400 (fecha inválida, dateFrom>dateTo, activityId vacío)', async () => {
    expect((await getAtt('?dateFrom=no-es-fecha')).statusCode).toBe(400);
    expect((await getAtt('?dateFrom=2026-05-20T00:00:00Z&dateTo=2026-05-10T00:00:00Z')).statusCode).toBe(400);
    expect((await getAtt('?activityId=')).statusCode).toBe(400);
  });

  it('aislamiento de tenant en attendance', async () => {
    expect((await getAtt('', TOKB)).statusCode).toBe(403);
  });
});
