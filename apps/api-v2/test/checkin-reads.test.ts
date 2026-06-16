// apps/api-v2/test/checkin-reads.test.ts · integration (skip sin DATABASE_URL).
// Check-in A · LECTURA: GET /checkin/metrics · /checkin/activities · /checkin/visitors.
// Cubre métricas en bordes de hoy/10min, únicos, actividades activa/llena/excluidas,
// movimiento reciente, búsqueda por cada campo, q vacío/corto/inválido, límite,
// roles 200, 401, cross-tenant 403 + cero PII cross-tenant, y cero writes.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.CHECKIN_TZ = 'America/Santo_Domingo';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { CheckinMetricsResponseSchema, CheckinActivitiesResponseSchema, CheckinVisitorsResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

run('GET /checkin/* · lectura', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `cki-a-${stamp}`;
  const slugB = `cki-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { owner: `cki-own-${stamp}`, admin: `cki-adm-${stamp}`, operator: `cki-ope-${stamp}`, b: `cki-b-${stamp}` };
  let act1: string; // activa, con check-ins
  let act2: string; // activa, llena

  const mkOrg = async (slug: string) => (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };
  const mkActivity = async (orgId: string, name: string, status: 'activa' | 'finalizada' | 'cancelada', capacity: number, enrolled: number, date: string) =>
    (await db.insertInto('activities').values({ id: randomUUID(), organization_id: orgId, name, type: 'concierto', location: 'Sala', date, capacity, enrolled_count: enrolled, status }).returning('id').executeTakeFirstOrThrow()).id;
  const mkUser = async (orgId: string, code: string, first: string, last: string, email: string | null, phone: string | null, visits: number) =>
    (await db.insertInto('users').values({ id: randomUUID(), code, first_name: first, last_name: last, email, phone, visit_count: visits, organization_id: orgId }).returning('id').executeTakeFirstOrThrow()).id;
  const mkAtt = async (orgId: string, activityId: string, userId: string | null, checkedInAt: string | null, anonymous = false) =>
    db.insertInto('attendance').values({ id: randomUUID(), organization_id: orgId, user_id: userId, user_code: null, activity_id: activityId, activity_name: 'x', checked_in_at: checkedInAt, anonymous }).execute();
  const mkInvite = async (orgId: string, activityId: string, userId: string, status: 'pending' | 'canceled' = 'pending') =>
    db.insertInto('invitations').values({ organization_id: orgId, activity_id: activityId, user_id: userId, token: `tok-${randomUUID()}`, status, expires_at: future(30) } as never).execute();

  let u1: string, u2: string, u3: string, actFin: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');

    act1 = await mkActivity(orgAId, 'Activa con movimiento', 'activa', 100, 40, future(7));
    act2 = await mkActivity(orgAId, 'Activa llena', 'activa', 30, 30, future(3));
    actFin = await mkActivity(orgAId, 'Finalizada', 'finalizada', 50, 10, daysAgo(2));
    await mkActivity(orgAId, 'Cancelada', 'cancelada', 50, 0, future(1));

    u1 = await mkUser(orgAId, `CKI-AAA1-${stamp}`, 'Sofía', 'Méndez', 'sofia@ckitest.do', '809-111-2222', 5);
    u2 = await mkUser(orgAId, `CKI-BBB2-${stamp}`, 'Carlos', 'Beltrán', 'carlos@ckitest.do', '809-333-4444', 2);
    u3 = await mkUser(orgAId, `CKI-CCC3-${stamp}`, 'Ana', 'Álvarez', null, null, 10);
    // Usuario de OTRO tenant con token de búsqueda compartido (no debe filtrarse).
    await mkUser(orgBId, `CKI-XTEN-${stamp}`, 'Cross', 'Tenant', 'cross@b.do', '809-999-0000', 1);

    // Asistencias: hoy/last10/anon/no-hoy/RSVP-sin-checkin.
    await mkAtt(orgAId, act1, u1, minutesAgo(0)); // hoy + last10
    await mkAtt(orgAId, act1, u2, minutesAgo(20)); // hoy, NO last10
    await mkAtt(orgAId, act1, null, minutesAgo(1), true); // hoy + last10, anónimo
    await mkAtt(orgAId, act2, u1, daysAgo(2)); // NO hoy (otro día) → no cuenta
    await mkAtt(orgAId, act2, u2, null); // RSVP sin check-in (otra actividad) → no cuenta en nada

    // Invitaciones para el chip "En la lista": u1 invitado a act1 (activa) → aparece;
    // u1 invitado a actFin (finalizada) → NO; u2 invitado a act2 pero CANCELADO → NO.
    await mkInvite(orgAId, act1, u1);
    await mkInvite(orgAId, actFin, u1);
    await mkInvite(orgAId, act2, u2, 'canceled');
    // Para guestList de act1: Ana también invitada (pendiente, sin check-in) →
    // act1 queda total=2 (u1+Ana), arrived=1 (u1 ya tiene check-in real).
    await mkInvite(orgAId, act1, u3);

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('attendance').where('organization_id', '=', id).execute();
      await db.deleteFrom('invitations').where('organization_id', '=', id).execute();
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('users').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const get = (url: string, host: string, token?: string) =>
    app.inject({ method: 'GET', url, headers: { host }, ...(token ? { cookies: { contan2_session: token } } : {}) });

  // ── métricas ──
  it('métricas: hoy/10min/únicos/activas exactas + serverNow + timezone', async () => {
    const res = await get('/api/v2/checkin/metrics', hostA, TOK.admin);
    expect(res.statusCode).toBe(200);
    const body = CheckinMetricsResponseSchema.parse(res.json());
    expect(body.metrics.checkinsToday).toBe(3); // att hoy: u1(now), u2(20min), anon(1min) — RSVP y daysAgo excluidos
    expect(body.metrics.checkinsLast10Min).toBe(2); // u1(now) + anon(1min)
    expect(body.metrics.uniqueVisitorsToday).toBe(3); // u1,u2 (named) + 1 anónimo
    expect(body.metrics.activeActivities).toBe(2); // act1, act2 (finalizada/cancelada excluidas)
    expect(typeof body.serverNow).toBe('string');
    expect(body.timezone).toBe('America/Santo_Domingo');
  });

  // ── actividades ──
  it('actividades: sólo activa, con disponibles/%/llena/movimiento reciente', async () => {
    const body = CheckinActivitiesResponseSchema.parse((await get('/api/v2/checkin/activities', hostA, TOK.operator)).json());
    expect(body.items.length).toBe(2);
    const a1 = body.items.find((a) => a.id === act1)!;
    const a2 = body.items.find((a) => a.id === act2)!;
    expect(a1.available).toBe(60); // 100-40
    expect(a1.occupancyPct).toBe(40);
    expect(a1.full).toBe(false);
    expect(a1.recentMovement).toBe(2); // u1(now)+anon(1min); u2(20min) y daysAgo no
    expect(a2.full).toBe(true); // 30/30
    expect(a2.available).toBe(0);
    expect(a2.recentMovement).toBe(0);
    // ninguna finalizada/cancelada
    expect(body.items.some((a) => a.name.includes('Finalizada') || a.name.includes('Cancelada'))).toBe(false);
  });

  it('guestList: total/llegaron por actividad; cancelada y sin-lista → null', async () => {
    const body = CheckinActivitiesResponseSchema.parse((await get('/api/v2/checkin/activities', hostA, TOK.admin)).json());
    const a1 = body.items.find((a) => a.id === act1)!;
    expect(a1.guestList).toEqual({ total: 2, arrived: 1 }); // u1 (llegó) + Ana (no); u1 con check-in real
    const a2 = body.items.find((a) => a.id === act2)!;
    expect(a2.guestList ?? null).toBeNull(); // u2 invitado pero CANCELADO → sin lista
  });

  // ── visitantes ──
  const visitors = async (q: string, extra = '', token = TOK.admin) =>
    CheckinVisitorsResponseSchema.parse((await get(`/api/v2/checkin/visitors?q=${encodeURIComponent(q)}${extra}`, hostA, token)).json());

  it('búsqueda por código / nombre / apellido / email / teléfono', async () => {
    expect((await visitors('AAA1')).items.some((v) => v.id === u1)).toBe(true); // código
    expect((await visitors('sofía')).items.some((v) => v.id === u1)).toBe(true); // nombre
    expect((await visitors('beltrán')).items.some((v) => v.id === u2)).toBe(true); // apellido
    expect((await visitors('carlos@ckitest')).items.some((v) => v.id === u2)).toBe(true); // email
    expect((await visitors('333-4444')).items.some((v) => v.id === u2)).toBe(true); // teléfono
    // NOMBRE COMPLETO multi-palabra, sin acentos (bug consola 2026-06-11):
    expect((await visitors('sofia mendez')).items.some((v) => v.id === u1)).toBe(true);
  });

  it('respuesta mínima: id/código/nombre/email/visitCount, sin teléfono', async () => {
    const v = (await visitors('AAA1')).items[0]!;
    expect(v).toHaveProperty('code');
    expect(v).toHaveProperty('visitCount');
    expect(v).not.toHaveProperty('phone');
  });

  it('invitedTo: invitado a actividad ACTIVA aparece; finalizada y cancelada NO', async () => {
    const v1 = (await visitors('AAA1')).items.find((v) => v.id === u1)!;
    expect(v1.invitedTo).toEqual([{ activityId: act1, activityName: 'Activa con movimiento' }]); // solo la activa (la finalizada se excluye)
    const v2 = (await visitors('BBB2')).items.find((v) => v.id === u2)!;
    expect(v2.invitedTo ?? []).toEqual([]); // invitación cancelada → no aparece
  });

  it('comando *protocolo: ?protocol=1 → solo invitados de protocolo (perfil activo), todos marcados', async () => {
    await db.insertInto('protocol_profiles').values({ user_id: u1, organization_id: orgAId, category: 'diplomatico', honorific: null, active: true } as never).execute();
    try {
      const body = CheckinVisitorsResponseSchema.parse((await get('/api/v2/checkin/visitors?protocol=1', hostA, TOK.admin)).json());
      expect(body.items.some((v) => v.id === u1)).toBe(true);
      expect(body.items.some((v) => v.id === u2)).toBe(false); // u2 no es protocolo
      expect(body.items.length > 0 && body.items.every((v) => v.protocol)).toBe(true);
    } finally {
      await db.deleteFrom('protocol_profiles').where('user_id', '=', u1).execute();
    }
  });

  it('q vacío / corto → lista vacía (sin dump)', async () => {
    expect((await visitors('')).items.length).toBe(0);
    expect((await visitors('a')).items.length).toBe(0); // 1 char < mínimo
  });

  it('q inválido (no string) → 400', async () => {
    const res = await get('/api/v2/checkin/visitors?q=a&q=b', hostA, TOK.admin); // q array
    expect(res.statusCode).toBe(400);
  });

  it('límite: respeta limit y lo capa en 20', async () => {
    // Sembrar 21 usuarios con token común para probar el cap.
    for (let i = 0; i < 21; i++) await mkUser(orgAId, `CKICAP${i}-${stamp}`, 'Cap', `Test${i}`, `cap${i}@cap.do`, null, 0);
    expect((await visitors('CKICAP', '&limit=5')).items.length).toBe(5);
    expect((await visitors('CKICAP', '&limit=999')).items.length).toBe(20); // capado
  });

  it('orden determinista (visit_count desc)', async () => {
    const items = (await visitors('ckitest')).items; // u1(5) y u2(2)
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0]!.id).toBe(u1); // 5 visitas antes que 2
  });

  it('cero PII cross-tenant: búsqueda en host A nunca devuelve usuarios de B', async () => {
    const items = (await visitors('CKI-XTEN')).items;
    expect(items.length).toBe(0);
  });

  // ── auth / roles ──
  it('owner/admin/operator → 200 en los 3 endpoints', async () => {
    for (const t of [TOK.owner, TOK.admin, TOK.operator]) {
      expect((await get('/api/v2/checkin/metrics', hostA, t)).statusCode).toBe(200);
      expect((await get('/api/v2/checkin/activities', hostA, t)).statusCode).toBe(200);
      expect((await get('/api/v2/checkin/visitors?q=sof', hostA, t)).statusCode).toBe(200);
    }
  });

  it('sin sesión → 401; cross-tenant (staff de B en host A) → 403', async () => {
    expect((await get('/api/v2/checkin/metrics', hostA)).statusCode).toBe(401);
    expect((await get('/api/v2/checkin/activities', hostA)).statusCode).toBe(401);
    expect((await get('/api/v2/checkin/visitors?q=sof', hostA)).statusCode).toBe(401);
    expect((await get('/api/v2/checkin/metrics', hostA, TOK.b)).statusCode).toBe(403);
    expect((await get('/api/v2/checkin/visitors?q=sof', hostA, TOK.b)).statusCode).toBe(403);
  });

  it('LECTURA: cero escrituras (counts intactos)', async () => {
    const before = await db.selectFrom('attendance').select(db.fn.countAll<number>().as('n')).where('organization_id', '=', orgAId).executeTakeFirstOrThrow();
    await get('/api/v2/checkin/metrics', hostA, TOK.admin);
    await get('/api/v2/checkin/activities', hostA, TOK.admin);
    await get('/api/v2/checkin/visitors?q=sof', hostA, TOK.admin);
    const after = await db.selectFrom('attendance').select(db.fn.countAll<number>().as('n')).where('organization_id', '=', orgAId).executeTakeFirstOrThrow();
    expect(Number(after.n)).toBe(Number(before.n));
  });
});
