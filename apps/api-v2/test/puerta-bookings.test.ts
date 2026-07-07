// apps/api-v2/test/puerta-bookings.test.ts · integration (skip sin DATABASE_URL).
// Agenda de la Sala VR: crear reserva, confirmar (dry-run → notified_at null),
// cancelar/no-vino, check-in desde la reserva (attendance grupo), roles/tenant.

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

run('Puerta · agenda de reservas (Sala VR)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `pb-a-${stamp}`;
  const slugB = `pb-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string; let orgBId: string; let salaId: string;
  const TOK = { admin: `pb-adm-${stamp}`, operator: `pb-ope-${stamp}`, b: `pb-b-${stamp}` };
  // Reserva a 3 días (futuro, cae en el rango "próximos" por defecto).
  const future = new Date(Date.now() + 3 * 86400000).toISOString();

  const mkOrg = async (slug: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA); orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');
    salaId = (await db.insertInto('activities').values({ id: randomUUID(), organization_id: orgAId, name: 'Sala VR', type: 'otro', location: 'VR', date: future, capacity: 8, enrolled_count: 0, status: 'activa', is_permanent: true }).returning('id').executeTakeFirstOrThrow()).id;
    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('space_bookings').where('organization_id', '=', id).execute();
      await db.deleteFrom('attendance').where('organization_id', '=', id).execute();
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const post = (url: string, body: unknown, token?: string, host = hostA) =>
    app.inject({ method: 'POST', url, headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, payload: body });
  const patch = (url: string, body: unknown, token?: string, host = hostA) =>
    app.inject({ method: 'PATCH', url, headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, payload: body });
  const get = (url: string, token?: string, host = hostA) =>
    app.inject({ method: 'GET', url, headers: { host, ...(token ? { cookie: `contan2_session=${token}` } : {}) } });

  const mkBooking = (extra: Record<string, unknown> = {}, token = TOK.admin) =>
    post('/api/v2/puerta/bookings', { salaId, scheduledAt: future, colegio: 'Colegio San Juan', level: '3ro B', contactName: 'Prof. Ana', contactEmail: 'ana@colegio.do', studentCount: 28, ...extra }, token);

  it('crear reserva (admin) → 201 scheduled; GET la lista', async () => {
    const res = await mkBooking();
    expect(res.statusCode).toBe(201);
    expect(res.json().booking).toMatchObject({ colegio: 'Colegio San Juan', studentCount: 28, status: 'scheduled', salaName: 'Sala VR' });
    const list = await get('/api/v2/puerta/bookings', TOK.admin);
    expect(list.json().bookings.some((b: { colegio: string }) => b.colegio === 'Colegio San Juan')).toBe(true);
  });

  it('confirmar → status confirmed + confirmedAt; sin RESEND (dry-run) notifiedAt queda null', async () => {
    const id = (await mkBooking()).json().booking.id;
    const res = await patch(`/api/v2/puerta/bookings/${id}`, { action: 'confirm' }, TOK.admin);
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.status).toBe('confirmed');
    expect(res.json().booking.confirmedAt).not.toBeNull();
    expect(res.json().booking.notifiedAt).toBeNull(); // dry-run sin RESEND_API_KEY
  });

  it('check-in desde la reserva → inserta attendance grupo (1+alumnos), status attended; repetir → 409', async () => {
    const id = (await mkBooking({ studentCount: 10 })).json().booking.id;
    const res = await post(`/api/v2/puerta/bookings/${id}/checkin`, {}, TOK.admin);
    expect(res.statusCode).toBe(201);
    expect(res.json().partySize).toBe(11); // 1 profesor + 10 alumnos
    expect(res.json().booking).toMatchObject({ status: 'attended' });
    expect(res.json().booking.attendanceId).not.toBeNull();
    // La asistencia quedó registrada como grupo (companions_children = alumnos).
    const att = await db.selectFrom('attendance').select(['companions_children', 'group_label', 'anonymous']).where('id', '=', res.json().booking.attendanceId).executeTakeFirstOrThrow();
    expect(Number(att.companions_children)).toBe(10);
    expect(att.group_label).toBe('Colegio San Juan');
    // Repetir el check-in → 409.
    expect((await post(`/api/v2/puerta/bookings/${id}/checkin`, {}, TOK.admin)).statusCode).toBe(409);
  });

  it('cancelar / no-vino → estados terminales', async () => {
    const id = (await mkBooking()).json().booking.id;
    expect((await patch(`/api/v2/puerta/bookings/${id}`, { action: 'cancel' }, TOK.admin)).json().booking.status).toBe('cancelled');
    const id2 = (await mkBooking()).json().booking.id;
    expect((await patch(`/api/v2/puerta/bookings/${id2}`, { action: 'no_show' }, TOK.admin)).json().booking.status).toBe('no_show');
  });

  it('validación/roles: sala inexistente → 404; sin sesión → 401; cross-tenant → 403', async () => {
    expect((await mkBooking({ salaId: randomUUID() })).statusCode).toBe(404);
    // sin sesión (post directo, sin token — no usar mkBooking porque su default es admin)
    expect((await post('/api/v2/puerta/bookings', { salaId, scheduledAt: future, colegio: 'X', contactName: 'Y', studentCount: 1 })).statusCode).toBe(401);
    expect((await mkBooking({}, TOK.b)).statusCode).toBe(403); // admin de B en host A
    expect((await post('/api/v2/puerta/bookings', { salaId, colegio: '' }, TOK.admin)).statusCode).toBe(400);
  });
});
