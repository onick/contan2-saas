// apps/api-v2/test/puerta-bookings-estados.test.ts · integration (skip sin DATABASE_URL).
// PUE-A03: máquina de estados de la agenda de la Sala VR, check-in atómico, check-in
// solo el día de la reserva, "No vino" manual y automático (close-day), correo fuera
// de la transacción e idempotente, vuelta a `confirmed` al borrar la asistencia.
// Requiere la migración 056 aplicada.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, sql, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';

// Espía del envío de correo: por defecto delega en la implementación real (dry-run
// sin RESEND_API_KEY → skipped); los tests fijan resultados puntuales.
const emailSpy = vi.hoisted(() => ({ calls: [] as { kind: string; to: string }[], next: [] as unknown[] }));
vi.mock('../src/services/booking-email.js', async (orig) => {
  const m = await orig<typeof import('../src/services/booking-email.js')>();
  return {
    ...m,
    bookingEmail: vi.fn(async (kind: string, db: never, orgId: string, to: string, ...rest: never[]) => {
      emailSpy.calls.push({ kind, to });
      if (emailSpy.next.length) return emailSpy.next.shift();
      return (m.bookingEmail as (...a: unknown[]) => unknown)(kind, db, orgId, to, ...rest);
    }),
  };
});
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;
const TZ = 'America/Santo_Domingo';
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

run('Puerta · agenda · máquina de estados (PUE-A03)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const hostA = `pbe-a-${stamp}.contan2.com`;
  const hostB = `pbe-b-${stamp}.contan2.com`;
  let orgAId: string; let orgBId: string; let salaId: string;
  const TOK = { admin: `pbe-adm-${stamp}`, operator: `pbe-ope-${stamp}`, b: `pbe-b-${stamp}` };
  const future = new Date(Date.now() + 3 * 86400000).toISOString();

  const mkOrg = async (slug: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(`pbe-a-${stamp}`); orgBId = await mkOrg(`pbe-b-${stamp}`);
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');
    salaId = (await db.insertInto('activities').values({ id: randomUUID(), organization_id: orgAId, name: 'Sala VR', type: 'otro', location: 'VR', date: future, capacity: 8, enrolled_count: 0, status: 'activa', is_permanent: true }).returning('id').executeTakeFirstOrThrow()).id;
    app = buildApp(); await app.ready();
  });

  beforeEach(() => { emailSpy.calls.length = 0; emailSpy.next.length = 0; });

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

  const hdr = (token?: string, host = hostA) => ({ host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) });
  const post = (url: string, body: unknown, token = TOK.admin, host = hostA) => app.inject({ method: 'POST', url, headers: hdr(token, host), payload: body as object });
  const patch = (url: string, body: unknown, token = TOK.admin, host = hostA) => app.inject({ method: 'PATCH', url, headers: hdr(token, host), payload: body as object });
  const del = (url: string, token = TOK.admin) => app.inject({ method: 'DELETE', url, headers: { host: hostA, cookie: `contan2_session=${token}` } });

  // Inserta una reserva directo en la DB con el estado/fecha pedidos.
  const mk = async (over: Partial<{ status: string; scheduled_at: string; contact_email: string | null; notified_at: string | null; attendance_id: string | null }> = {}) =>
    (await db.insertInto('space_bookings').values({
      organization_id: orgAId, activity_id: salaId, scheduled_at: over.scheduled_at ?? future, colegio: 'Colegio Estados',
      contact_name: 'Prof. Eva', contact_email: over.contact_email === undefined ? 'eva@colegio.do' : over.contact_email,
      student_count: 12, status: over.status ?? 'scheduled', notified_at: over.notified_at ?? null,
      attendance_id: over.attendance_id ?? null,
    }).returning('id').executeTakeFirstOrThrow()).id;
  const row = (id: string) => db.selectFrom('space_bookings').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  // ── Matriz de transiciones ─────────────────────────────────────────────────
  const ACTIONS = {
    confirm: { allowed: ['scheduled'], go: (id: string) => patch(`/api/v2/puerta/bookings/${id}`, { action: 'confirm' }) },
    cancel: { allowed: ['scheduled', 'confirmed'], go: (id: string) => patch(`/api/v2/puerta/bookings/${id}`, { action: 'cancel' }) },
    no_show: { allowed: ['scheduled', 'confirmed'], go: (id: string) => patch(`/api/v2/puerta/bookings/${id}`, { action: 'no_show' }) },
    no_show_post: { allowed: ['scheduled', 'confirmed'], go: (id: string) => post(`/api/v2/puerta/bookings/${id}/no-show`, {}) },
    reschedule: { allowed: ['scheduled', 'confirmed', 'no_show'], go: (id: string) => patch(`/api/v2/puerta/bookings/${id}`, { action: 'reschedule', scheduledAt: new Date(Date.now() + 5 * 86400000).toISOString() }) },
    checkin: { allowed: ['scheduled', 'confirmed', 'no_show'], go: (id: string) => post(`/api/v2/puerta/bookings/${id}/checkin`, { force: true }) },
  } as const;
  const STATES = ['scheduled', 'confirmed', 'attended', 'no_show', 'cancelled'];

  for (const [name, spec] of Object.entries(ACTIONS)) {
    for (const st of STATES) {
      const ok = (spec.allowed as readonly string[]).includes(st);
      it(`matriz · ${name} desde ${st} → ${ok ? '2xx' : '409'}`, async () => {
        const id = await mk({ status: st });
        const res = await spec.go(id);
        if (ok) expect(res.statusCode, res.body).toBeLessThan(300);
        else {
          expect(res.statusCode, res.body).toBe(409);
          expect(res.json().error).toMatch(/reserva/i);
          expect((await row(id)).status).toBe(st); // no cambió
        }
      });
    }
  }

  // ── Check-in atómico ───────────────────────────────────────────────────────
  it('dos check-ins en paralelo → una sola asistencia', async () => {
    const id = await mk({ status: 'confirmed', scheduled_at: new Date().toISOString() });
    const [r1, r2] = await Promise.all([
      post(`/api/v2/puerta/bookings/${id}/checkin`, {}),
      post(`/api/v2/puerta/bookings/${id}/checkin`, {}),
    ]);
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([201, 409]);
    const b = await row(id);
    expect(b.status).toBe('attended');
    const n = await db.selectFrom('attendance').select(db.fn.countAll().as('n')).where('organization_id', '=', orgAId).where('id', '=', b.attendance_id!).executeTakeFirstOrThrow();
    expect(Number(n.n)).toBe(1);
    const groups = await db.selectFrom('attendance').select('id').where('organization_id', '=', orgAId).where('group_contact', '=', 'Prof. Eva').where('activity_id', '=', salaId).execute();
    // Todas las asistencias de "Prof. Eva" de los tests previos incluyen la de este caso: solo una por reserva.
    expect(groups.filter((g) => g.id === b.attendance_id)).toHaveLength(1);
  });

  it('check-in en otro día → 409 requiresForce; operator con force → 403; admin con force → 201', async () => {
    const id = await mk({ status: 'confirmed' }); // dentro de 3 días
    const r = await post(`/api/v2/puerta/bookings/${id}/checkin`, {});
    expect(r.statusCode).toBe(409);
    expect(r.json().requiresForce).toBe(true);
    expect(r.json().error).toMatch(/Registrar la entrada igual hoy/);
    expect((await post(`/api/v2/puerta/bookings/${id}/checkin`, { force: true }, TOK.operator)).statusCode).toBe(403);
    expect((await row(id)).status).toBe('confirmed');
    const ok = await post(`/api/v2/puerta/bookings/${id}/checkin`, { force: true });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().booking.status).toBe('attended');
  });

  it('check-in el mismo día, sin force → 201; no_show tardío puede llegar (no_show → attended)', async () => {
    const id = await mk({ status: 'no_show', scheduled_at: new Date().toISOString() });
    expect((await post(`/api/v2/puerta/bookings/${id}/checkin`, {})).statusCode).toBe(201);
  });

  // ── No vino manual ─────────────────────────────────────────────────────────
  it('POST /no-show marca no_show con no_show_at y audita', async () => {
    const id = await mk({ status: 'confirmed' });
    const res = await post(`/api/v2/puerta/bookings/${id}/no-show`, {});
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.status).toBe('no_show');
    expect((await row(id)).no_show_at).not.toBeNull();
    const a = await db.selectFrom('tenant_audit_log').select('action').where('organization_id', '=', orgAId).where('target_id', '=', id).execute();
    expect(a.map((x) => x.action)).toContain('puerta.booking.no_show');
  });

  // ── Cierre del día ─────────────────────────────────────────────────────────
  it('close-day marca No vino solo las vencidas sin asistencia y es idempotente', async () => {
    const past = new Date(Date.now() - 60_000);
    const date = ymd(past);
    const a = await mk({ status: 'confirmed', scheduled_at: past.toISOString() });
    const d = await mk({ status: 'scheduled', scheduled_at: past.toISOString() });
    const att = await mk({ status: 'attended', scheduled_at: past.toISOString() });
    const cancelled = await mk({ status: 'cancelled', scheduled_at: past.toISOString() });
    const otherDay = await mk({ status: 'confirmed', scheduled_at: new Date(past.getTime() - 3 * 86400000).toISOString() });
    const upcoming = await mk({ status: 'confirmed' }); // futura

    expect((await post(`/api/v2/puerta/bookings/close-day?date=${date}`, {}, TOK.operator)).statusCode).toBe(403);
    const res = await post(`/api/v2/puerta/bookings/close-day?date=${date}`, {});
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().date).toBe(date);
    expect(res.json().bookingIds).toEqual(expect.arrayContaining([a, d]));
    expect(res.json().bookingIds).not.toEqual(expect.arrayContaining([att]));
    expect((await row(a)).status).toBe('no_show');
    expect((await row(d)).status).toBe('no_show');
    for (const [id, st] of [[att, 'attended'], [cancelled, 'cancelled'], [otherDay, 'confirmed'], [upcoming, 'confirmed']] as const) {
      expect((await row(id)).status).toBe(st);
    }
    const again = await post(`/api/v2/puerta/bookings/close-day?date=${date}`, {});
    expect(again.json()).toMatchObject({ closed: 0, bookingIds: [] });
    // fecha inválida / futura → 400
    expect((await post('/api/v2/puerta/bookings/close-day?date=hoy', {})).statusCode).toBe(400);
    expect((await post(`/api/v2/puerta/bookings/close-day?date=${ymd(new Date(Date.now() + 5 * 86400000))}`, {})).statusCode).toBe(400);
  });

  // ── Borrar la asistencia devuelve la reserva a confirmed ───────────────────
  it('Deshacer la entrada de una reserva → la reserva vuelve a confirmed sin attendance_id', async () => {
    const id = await mk({ status: 'confirmed', scheduled_at: new Date().toISOString() });
    const ci = await post(`/api/v2/puerta/bookings/${id}/checkin`, {});
    const attId = ci.json().booking.attendanceId as string;
    const v = await del(`/api/v2/puerta/entries/${attId}`);
    expect(v.statusCode, v.body).toBe(200);
    const b = await row(id);
    expect(b.status).toBe('confirmed');
    expect(b.attendance_id).toBeNull();
    // y se puede volver a hacer el check-in
    expect((await post(`/api/v2/puerta/bookings/${id}/checkin`, {})).statusCode).toBe(201);
  });

  it('FK: borrar la asistencia directo en la DB deja attendance_id NULL (sin huérfanos)', async () => {
    const id = await mk({ status: 'confirmed', scheduled_at: new Date().toISOString() });
    const attId = (await post(`/api/v2/puerta/bookings/${id}/checkin`, {})).json().booking.attendanceId as string;
    await db.deleteFrom('attendance').where('id', '=', attId).execute();
    const b = await row(id);
    expect(b.attendance_id).toBeNull();
    expect(b.status).toBe('confirmed');
  });

  // ── Correos ────────────────────────────────────────────────────────────────
  it('confirm ×2 → 1 solo correo (la 2.ª es 409)', async () => {
    const id = await mk({ status: 'scheduled' });
    emailSpy.next.push({ sent: true });
    expect((await patch(`/api/v2/puerta/bookings/${id}`, { action: 'confirm' })).statusCode).toBe(200);
    expect((await patch(`/api/v2/puerta/bookings/${id}`, { action: 'confirm' })).statusCode).toBe(409);
    expect(emailSpy.calls.filter((c) => c.kind === 'confirmed')).toHaveLength(1);
    expect((await row(id)).notified_at).not.toBeNull();
  });

  it('confirm con correo fallido → email_error guardado y visible; notified_at sigue null', async () => {
    const id = await mk({ status: 'scheduled' });
    emailSpy.next.push({ sent: false, error: 'resend caído' });
    const res = await patch(`/api/v2/puerta/bookings/${id}`, { action: 'confirm' });
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.status).toBe('confirmed');
    expect(res.json().booking.emailError).toBe('resend caído');
    expect((await row(id)).notified_at).toBeNull();
  });

  it('cancelar tras avisar → correo de cancelación; sin aviso previo → ningún correo', async () => {
    const avisada = await mk({ status: 'confirmed', notified_at: new Date().toISOString() });
    await patch(`/api/v2/puerta/bookings/${avisada}`, { action: 'cancel' });
    expect(emailSpy.calls.map((c) => c.kind)).toEqual(['cancelled']);
    expect((await row(avisada)).cancelled_at).not.toBeNull();
    emailSpy.calls.length = 0;
    const sinAviso = await mk({ status: 'scheduled' });
    await patch(`/api/v2/puerta/bookings/${sinAviso}`, { action: 'cancel' });
    expect(emailSpy.calls).toHaveLength(0);
  });

  it('reprogramar: guarda rescheduled_from, queda confirmed y manda correo de reprogramación (o confirmación si nunca se avisó)', async () => {
    const original = new Date(Date.now() + 2 * 86400000).toISOString();
    const nueva = new Date(Date.now() + 6 * 86400000).toISOString();
    const avisada = await mk({ status: 'confirmed', notified_at: new Date().toISOString(), scheduled_at: original });
    const res = await patch(`/api/v2/puerta/bookings/${avisada}`, { action: 'reschedule', scheduledAt: nueva });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().booking).toMatchObject({ status: 'confirmed', scheduledAt: new Date(nueva).toISOString(), rescheduledFrom: new Date(original).toISOString() });
    expect(emailSpy.calls.map((c) => c.kind)).toEqual(['rescheduled']);
    emailSpy.calls.length = 0;
    const nunca = await mk({ status: 'scheduled', scheduled_at: original });
    await patch(`/api/v2/puerta/bookings/${nunca}`, { action: 'reschedule', scheduledAt: nueva });
    expect(emailSpy.calls.map((c) => c.kind)).toEqual(['confirmed']);
    // fecha inválida → 400
    expect((await patch(`/api/v2/puerta/bookings/${nunca}`, { action: 'reschedule', scheduledAt: 'mañana' })).statusCode).toBe(400);
  });

  // ── Auditoría y tenant ─────────────────────────────────────────────────────
  it('audita puerta.booking.confirmed / cancelled / checked_in', async () => {
    const id = await mk({ status: 'scheduled', scheduled_at: new Date().toISOString() });
    await patch(`/api/v2/puerta/bookings/${id}`, { action: 'confirm' });
    await post(`/api/v2/puerta/bookings/${id}/checkin`, {});
    const id2 = await mk({ status: 'scheduled' });
    await patch(`/api/v2/puerta/bookings/${id2}`, { action: 'cancel' });
    const a = await db.selectFrom('tenant_audit_log').select(['action', 'target_id']).where('organization_id', '=', orgAId).where('target_id', 'in', [id, id2]).execute();
    const acts = a.map((x) => `${x.target_id === id ? 'A' : 'B'}:${x.action}`);
    expect(acts).toEqual(expect.arrayContaining(['A:puerta.booking.confirmed', 'A:puerta.booking.checked_in', 'B:puerta.booking.cancelled']));
  });

  it('RLS (rol app_v2): con el GUC de otra org no se ven ni se editan las reservas', async () => {
    const id = await mk({ status: 'scheduled' });
    const res = await db.transaction().execute(async (tx) => {
      await sql`set local role app_v2`.execute(tx);
      await sql`select set_config('app.organization_id', ${orgBId}, true)`.execute(tx);
      const seen = await tx.selectFrom('space_bookings').select('id').where('id', '=', id).execute();
      const upd = await tx.updateTable('space_bookings').set({ status: 'cancelled' }).where('id', '=', id).returning('id').execute();
      await sql`select set_config('app.organization_id', ${orgAId}, true)`.execute(tx);
      const own = await tx.selectFrom('space_bookings').select('id').where('id', '=', id).execute();
      return { seen: seen.length, upd: upd.length, own: own.length };
    });
    expect(res).toEqual({ seen: 0, upd: 0, own: 1 });
  });

  it('tenant: el admin de otra organización no ve ni edita la reserva (404)', async () => {
    const id = await mk({ status: 'scheduled' });
    expect((await patch(`/api/v2/puerta/bookings/${id}`, { action: 'cancel' }, TOK.b, hostB)).statusCode).toBe(404);
    expect((await post(`/api/v2/puerta/bookings/${id}/checkin`, { force: true }, TOK.b, hostB)).statusCode).toBe(404);
    expect((await post(`/api/v2/puerta/bookings/${id}/no-show`, {}, TOK.b, hostB)).statusCode).toBe(404);
    expect((await row(id)).status).toBe('scheduled');
    const list = await app.inject({ method: 'GET', url: '/api/v2/puerta/bookings', headers: hdr(TOK.b, hostB) });
    expect(JSON.stringify(list.json())).not.toContain(id);
  });
});
