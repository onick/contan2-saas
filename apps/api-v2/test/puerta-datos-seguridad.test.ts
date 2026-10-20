// apps/api-v2/test/puerta-datos-seguridad.test.ts · integration (skip sin DATABASE_URL).
// PR-P6: PUE-A08 (export solo REPORT_EXPORT_ROLES), PUE-A09 (tipo de sala explícito, sin
// deducir por capacidad; agenda solo en salas con has_agenda), PUE-A13 (/salas sin N+1,
// GET /bookings por día local de REPORT_TZ, POST /occupancy retirado).
// Requiere la migración 057 aplicada.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('Puerta · datos y seguridad (PR-P6)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const host = `pds-${stamp}.contan2.com`;
  const ROLES = ['admin', 'operator', 'consulta', 'puerta'] as const;
  const TOK = Object.fromEntries(ROLES.map((r) => [r, `pds-${r}-${stamp}`])) as Record<(typeof ROLES)[number], string>;
  let orgId: string; let vrId: string; let adaId: string; let infId: string;

  const call = (method: 'GET' | 'POST', url: string, role: (typeof ROLES)[number], body?: unknown) =>
    app.inject({
      method, url,
      headers: { host, cookie: `contan2_session=${TOK[role]}`, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
      ...(method === 'POST' ? { payload: (body ?? {}) as object } : {}),
    });

  const mkSala = async (name: string, extra: Record<string, unknown>) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id, organization_id: orgId, name, type: 'otro', location: 'Lobby', date: new Date().toISOString(),
      capacity: 8, enrolled_count: 0, status: 'activa', description: '', image_url: null,
      is_permanent: true, audience: 'adultos', ...extra,
    } as never).execute();
    return id;
  };
  const entry = (activityId: string, registeredAt: Date, extra: Record<string, unknown> = {}) =>
    db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, activity_id: activityId, activity_name: 'x', user_id: null, user_code: null,
      anonymous: true, companions_children: 0, companions_adults: 0, is_permanent: true,
      registered_at: registeredAt.toISOString(), checked_in_at: registeredAt.toISOString(), ...extra,
    } as never).execute();

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug: `pds-${stamp}`, name: 'Org PDS', status: 'active', code_prefix: 'PDS' }).returning('id').executeTakeFirstOrThrow()).id;
    for (const role of ROLES) {
      const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${stamp}@t.local`, password_hash: 'x', full_name: role, status: 'active', role } as never).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(TOK[role]), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    }
    // Ada: capacidad "ilimitada" histórica; VR: aforo 8 con agenda; 3.ª sala: aforo 30, kind 'otra', sin agenda.
    adaId = await mkSala('Sala Ada', { capacity: 100000, sala_kind: 'exposicion', has_agenda: false, aforo: null });
    vrId = await mkSala('Sala VR', { capacity: 8, sala_kind: 'vr', has_agenda: true, aforo: 8, audience: 'infantil' });
    infId = await mkSala('Sala Infantil', { capacity: 30, sala_kind: 'otra', has_agenda: false, aforo: 30, audience: 'infantil' });
    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('space_bookings').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('PUE-A08 · export.xlsx: operator/consulta → 403; admin/puerta → 200', async () => {
    for (const role of ['operator', 'consulta'] as const) {
      expect((await call('GET', '/api/v2/puerta/export.xlsx', role)).statusCode, role).toBe(403);
    }
    for (const role of ['admin', 'puerta'] as const) {
      const r = await call('GET', '/api/v2/puerta/export.xlsx', role);
      expect(r.statusCode, role).toBe(200);
      expect(r.headers['content-type']).toContain('spreadsheetml');
    }
  });

  it('PUE-A09 · /salas expone kind/hasAgenda/aforo explícitos; la 3.ª sala (aforo 30, otra) no es VR', async () => {
    const salas = (await call('GET', '/api/v2/puerta/salas', 'puerta')).json().salas as
      { id: string; kind: string; hasAgenda: boolean; aforo: number | null }[];
    const by = (id: string) => salas.find((s) => s.id === id)!;
    expect(by(adaId)).toMatchObject({ kind: 'exposicion', hasAgenda: false, aforo: null });
    expect(by(vrId)).toMatchObject({ kind: 'vr', hasAgenda: true, aforo: 8 });
    expect(by(infId)).toMatchObject({ kind: 'otra', hasAgenda: false, aforo: 30 });
    expect(salas.filter((s) => s.kind === 'vr').map((s) => s.id)).toEqual([vrId]);
    expect(salas.filter((s) => s.hasAgenda).map((s) => s.id)).toEqual([vrId]);
  });

  it('PUE-A09 · POST /bookings: 201 en la sala con agenda; 409 en la que no la tiene', async () => {
    const body = (salaId: string) => ({ salaId, scheduledAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), colegio: 'Colegio X', contactName: 'Prof', studentCount: 10 });
    expect((await call('POST', '/api/v2/puerta/bookings', 'admin', body(vrId))).statusCode).toBe(201);
    for (const id of [infId, adaId]) {
      const r = await call('POST', '/api/v2/puerta/bookings', 'admin', body(id));
      expect(r.statusCode).toBe(409);
      expect(r.json().error).toMatch(/no tiene agenda/i);
    }
    const n = await db.selectFrom('space_bookings').select('id').where('organization_id', '=', orgId).where('activity_id', 'in', [infId, adaId]).execute();
    expect(n).toHaveLength(0);
  });

  it('PUE-A13 · /salas: mismos números (hoy/semana, holds fuera) y SIN N+1 (mismo nº de consultas con 3 o 9 salas)', async () => {
    const now = new Date();
    await entry(vrId, now, { companions_children: 5 });                        // hoy: 6 personas
    await entry(vrId, now);                                                    // hoy: 1
    await entry(vrId, new Date(now.getTime() - 3 * 86_400_000));               // semana, no hoy: 1
    await entry(vrId, new Date(now.getTime() - 12 * 86_400_000));              // fuera de la semana
    await entry(vrId, now, { checked_in_at: null, companions_children: 9 });   // reserva sin check-in: no cuenta
    await entry(adaId, now, { companions_adults: 2 });                         // hoy: 3

    // Cuenta las consultas que llegan a Postgres durante una petición.
    const pgClient = createRequire(createRequire(import.meta.url).resolve('@contan2/db'))('pg').Client.prototype as { query: (...a: unknown[]) => unknown };
    const orig = pgClient.query;
    let queries = 0;
    pgClient.query = function (this: unknown, ...a: unknown[]) { queries += 1; return orig.apply(this, a); };
    const measure = async () => {
      queries = 0;
      const r = await call('GET', '/api/v2/puerta/salas', 'puerta');
      return { r, queries };
    };
    try {
      const small = await measure();
      for (let i = 0; i < 6; i += 1) await mkSala(`Extra ${i}`, { sala_kind: 'otra', has_agenda: false, aforo: null });
      const big = await measure();
      expect(big.queries).toBe(small.queries);
      expect(small.queries).toBeLessThanOrEqual(12);

      const salas = big.r.json().salas as { id: string; visitorsToday: number; visitorsWeek: number }[];
      const vr = salas.find((s) => s.id === vrId)!;
      const ada = salas.find((s) => s.id === adaId)!;
      expect([vr.visitorsToday, vr.visitorsWeek]).toEqual([7, 8]);
      expect([ada.visitorsToday, ada.visitorsWeek]).toEqual([3, 3]);
      expect(salas.find((s) => s.id === infId)).toMatchObject({ visitorsToday: 0, visitorsWeek: 0 });
    } finally {
      pgClient.query = orig;
    }
  });

  it('PUE-A13 · GET /bookings con YMD usa el día local (RD): 23:30 y 00:10 caen en días distintos', async () => {
    // 2030-06-15 23:30 RD = 2030-06-16 03:30Z · 2030-06-16 00:10 RD = 04:10Z (UTC-4 todo el año).
    const mk = (at: string, colegio: string) => db.insertInto('space_bookings').values({
      organization_id: orgId, activity_id: vrId, scheduled_at: at, colegio, contact_name: 'P', student_count: 5, status: 'scheduled',
    } as never).execute();
    await mk('2030-06-16T03:30:00Z', 'Noche15');
    await mk('2030-06-16T04:10:00Z', 'Madrugada16');
    const names = async (qs: string) =>
      ((await call('GET', `/api/v2/puerta/bookings?${qs}`, 'puerta')).json().bookings as { colegio: string }[]).map((b) => b.colegio).sort();
    expect(await names('from=2030-06-15&to=2030-06-15')).toEqual(['Noche15']);
    expect(await names('from=2030-06-16&to=2030-06-16')).toEqual(['Madrugada16']);
    expect(await names('from=2030-06-15&to=2030-06-16')).toEqual(['Madrugada16', 'Noche15']);
    // Los instantes ISO conservan su semántica previa (to exclusivo).
    expect(await names('from=2030-06-16T03:30:00Z&to=2030-06-16T04:10:00Z')).toEqual(['Noche15']);
  });

  it('PUE-A13 · POST /puerta/salas/:id/occupancy ya no existe (404)', async () => {
    expect((await call('POST', `/api/v2/puerta/salas/${vrId}/occupancy`, 'admin', { delta: 1 })).statusCode).toBe(404);
  });
});
