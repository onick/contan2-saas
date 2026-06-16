// apps/api-v2/test/activity-invitations.test.ts · integration (skip sin DATABASE_URL).
// RSVP S3: candidatos (segmento sugerido por categoría/tipo, exclusiones de
// registrados/invitados/sin-email, orden por afinidad) → invitar lote (reusa
// pending, vence date+1d) → responder público (no→declined; yes→cupo atómico +
// attendance SIN check-in; lleno→409; one-shot) → lista con summary → cancelar.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';
delete process.env.RESEND_API_KEY;

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { InviteCandidatesResponseSchema, ActivityInvitationsResponseSchema, RsvpPreviewResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;
const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

run('RSVP · invitar audiencia segmentada', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `rsvp-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  const TOK = { admin: `rsvp-adm-${stamp}`, operator: `rsvp-op-${stamp}` };

  let actCine: string; // categoría 'ciclo jazz' cap 2 → sugerido fans-cat
  let uFan1: string; let uFan2: string; let uFan3: string; let uSinEmail: string;

  const mk = async () => {
    orgAId = (await db.insertInto('organizations').values({ slug: slugA, name: 'RSVP Org', status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
    for (const [tok, role] of [[TOK.admin, 'admin'], [TOK.operator, 'operator']] as const) {
      const st = await db.insertInto('staff_members').values({
        organization_id: orgAId, email: `${role}-${stamp}@t.local`, password_hash: 'x',
        full_name: 'S', status: 'active', role,
      }).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({
        staff_member_id: st.id, token_hash: hashToken(tok),
        expires_at: future(1), remember_me: false,
      }).execute();
    }
  };
  const mkAct = async (over: Record<string, unknown> = {}) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id, organization_id: orgAId, name: `Act ${id.slice(0, 4)}`, type: 'cine', location: 'S',
      date: future(3), capacity: 50, enrolled_count: 0, status: 'activa',
      description: '', image_url: null, category: null, ...over,
    } as never).execute();
    return id;
  };
  const mkUser = async (email: string | null) => {
    const id = randomUUID();
    await db.insertInto('users').values({
      id, organization_id: orgAId, code: `CCB-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      first_name: 'F', last_name: `U${id.slice(0, 4)}`, email, phone: null, visit_count: 0,
    } as never).execute();
    return id;
  };
  const attend = async (act: string, user: string) => {
    await db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgAId, user_id: user, activity_id: act,
      activity_name: 'x', user_code: null, anonymous: false, companions_children: 0,
    } as never).execute();
  };
  // check-in REAL (puerta): a diferencia de la reserva del RSVP, setea checked_in_at.
  const attendCheckedIn = async (act: string, user: string) => {
    await db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgAId, user_id: user, activity_id: act,
      activity_name: 'x', user_code: null, anonymous: false, companions_children: 0,
      checked_in_at: new Date().toISOString(),
    } as never).execute();
  };

  let ipSeq = 0;
  const call = (method: string, url: string, body?: unknown, token?: string) =>
    app.inject({
      method: method as 'GET', url,
      headers: {
        host: hostA, 'x-forwarded-for': `10.2.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { cookie: `contan2_session=${token}` } : {}),
      },
      ...(body !== undefined ? { payload: body as object } : {}),
    });

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    await mk();
    // Historial: 3 fans del ciclo 'ciclo jazz' (≥1 asistencia a la categoría).
    const past = await mkAct({ category: 'ciclo jazz', status: 'finalizada', date: new Date(Date.now() - 86_400_000).toISOString() });
    uFan1 = await mkUser(`f1-${stamp}@t.local`);
    uFan2 = await mkUser(`f2-${stamp}@t.local`);
    uFan3 = await mkUser(`f3-${stamp}@t.local`);
    uSinEmail = await mkUser(null);
    for (const u of [uFan1, uFan2, uFan3, uSinEmail]) await attend(past, u);
    actCine = await mkAct({ category: 'ciclo jazz', capacity: 2 });
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('invitations').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('attendance').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
      db.selectFrom('staff_members').select('id').where('organization_id', '=', orgAId)).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgAId).execute();
    await db.destroy();
  });

  it('candidatos: sugiere el segmento del ciclo; excluye sin-email y ya-registrados', async () => {
    // uFan3 ya está registrado en la actividad objetivo.
    await attend(actCine, uFan3);
    await db.updateTable('activities').set({ enrolled_count: 1 }).where('id', '=', actCine).execute();

    const res = await call('GET', `/api/v2/activities/${actCine}/invite-candidates`, undefined, TOK.admin);
    expect(res.statusCode).toBe(200);
    const body = InviteCandidatesResponseSchema.parse(res.json());
    expect(body.suggestedSegmentId).toBe('fans-cat-ciclo-jazz');
    expect(body.segment.id).toBe('fans-cat-ciclo-jazz');
    const ids = body.candidates.map((c) => c.id);
    expect(ids).toContain(uFan1);
    expect(ids).toContain(uFan2);
    expect(ids).not.toContain(uFan3); // ya registrado
    expect(ids).not.toContain(uSinEmail);
    expect(body.excluded.alreadyRegistered).toBe(1);
    expect(body.excluded.noEmail).toBe(1);
    // operator no puede
    expect((await call('GET', `/api/v2/activities/${actCine}/invite-candidates`, undefined, TOK.operator)).statusCode).toBe(403);
  });

  it('invitar lote → 201 created; repetir → reused; lista con summary; candidatos los excluyen', async () => {
    const r1 = await call('POST', `/api/v2/activities/${actCine}/invitations`, { userIds: [uFan1, uFan2, uSinEmail] }, TOK.admin);
    expect(r1.statusCode).toBe(201);
    expect(r1.json().summary).toMatchObject({ created: 2, reused: 0, skipped: 1, dryRun: true });

    const r2 = await call('POST', `/api/v2/activities/${actCine}/invitations`, { userIds: [uFan1] }, TOK.admin);
    expect(r2.json().summary).toMatchObject({ created: 0, reused: 1 });

    const list = ActivityInvitationsResponseSchema.parse((await call('GET', `/api/v2/activities/${actCine}/invitations`, undefined, TOK.admin)).json());
    expect(list.summary).toMatchObject({ total: 2, pending: 2 });

    const cand = InviteCandidatesResponseSchema.parse((await call('GET', `/api/v2/activities/${actCine}/invite-candidates`, undefined, TOK.admin)).json());
    expect(cand.candidates.map((c) => c.id)).not.toContain(uFan1); // ya invitado
    expect(cand.excluded.alreadyInvited).toBe(2);
  });

  it('RSVP público: preview; no→declined; yes→cupo+asistencia sin check-in; lleno→409; one-shot', async () => {
    const tokens = await db.selectFrom('invitations').select(['token', 'user_id'])
      .where('activity_id', '=', actCine).execute();
    const t1 = tokens.find((t) => t.user_id === uFan1)!.token;
    const t2 = tokens.find((t) => t.user_id === uFan2)!.token;

    // preview pública
    const prev = await call('GET', `/api/v2/public/rsvp/${t1}`);
    expect(prev.statusCode).toBe(200);
    const pj = RsvpPreviewResponseSchema.parse(prev.json());
    expect(pj.invitation.status).toBe('pending');

    // yes de fan1 → confirma + reserva (cap 2, enrolled 1 → 2)
    const yes = await call('POST', `/api/v2/public/rsvp/${t1}`, { action: 'yes' });
    expect(yes.statusCode).toBe(200);
    expect(yes.json().status).toBe('confirmed');
    const att = await db.selectFrom('attendance').select(['checked_in_at'])
      .where('activity_id', '=', actCine).where('user_id', '=', uFan1).executeTakeFirstOrThrow();
    expect(att.checked_in_at).toBeNull(); // reserva, no check-in
    const act = await db.selectFrom('activities').select('enrolled_count').where('id', '=', actCine).executeTakeFirstOrThrow();
    expect(act.enrolled_count).toBe(2);

    // one-shot
    expect((await call('POST', `/api/v2/public/rsvp/${t1}`, { action: 'no' })).json().alreadyResponded).toBe(true);

    // fan2 yes → cupo LLENO (2/2) → 409 y la invitación sigue pending
    const full = await call('POST', `/api/v2/public/rsvp/${t2}`, { action: 'yes' });
    expect(full.statusCode).toBe(409);
    const inv2 = await db.selectFrom('invitations').select('status').where('token', '=', t2).executeTakeFirstOrThrow();
    expect(inv2.status).toBe('pending');

    // no de fan2 → declined sin tocar cupo
    expect((await call('POST', `/api/v2/public/rsvp/${t2}`, { action: 'no' })).json().status).toBe('declined');
  });

  it('lista: invitado con check-in REAL → "attended"; reserva sin check-in NO cuenta', async () => {
    const actX = await mkAct({ capacity: 10, enrolled_count: 0 });
    const u6 = await mkUser(`f6-${stamp}@t.local`);
    const u7 = await mkUser(`f7-${stamp}@t.local`);
    await call('POST', `/api/v2/activities/${actX}/invitations`, { userIds: [u6, u7] }, TOK.admin);

    await attendCheckedIn(actX, u6); // pasó por la puerta (checked_in_at seteado)
    await attend(actX, u7);          // solo reserva (como el RSVP "sí"): sin check-in

    const list = ActivityInvitationsResponseSchema.parse(
      (await call('GET', `/api/v2/activities/${actX}/invitations`, undefined, TOK.admin)).json());
    expect(list.summary).toMatchObject({ total: 2, attended: 1, pending: 1 });
    const byUser = Object.fromEntries(list.invitations.map((i) => [i.userId, i.status]));
    expect(byUser[u6]).toBe('attended');
    expect(byUser[u7]).not.toBe('attended'); // reserva sin check-in → sigue pending
    // attendanceId presente solo en el que llegó (para "Deshacer" en la puerta).
    const invU6 = list.invitations.find((i) => i.userId === u6)!;
    const invU7 = list.invitations.find((i) => i.userId === u7)!;
    expect(typeof invU6.attendanceId).toBe('string');
    expect(invU7.attendanceId ?? null).toBeNull();
  });

  it('entrega: POST en dry-run deja sent_at null; deliverInvitations con transporte real lo marca', async () => {
    const u5 = await mkUser(`f5-${stamp}@t.local`);
    await call('POST', `/api/v2/activities/${actCine}/invitations`, { userIds: [u5] }, TOK.admin);
    // fire-and-forget en dry-run (sin RESEND_API_KEY): sent_at queda null.
    await new Promise((r) => setTimeout(r, 150));
    const inv = await db.selectFrom('invitations').select(['id', 'token', 'sent_at'])
      .where('user_id', '=', u5).executeTakeFirstOrThrow();
    expect(inv.sent_at).toBeNull();

    // Entrega real (sender inyectado): marca sent_at SOLO tras { id }.
    const { deliverInvitations } = await import('../src/services/invitation-email.js');
    const sent: string[] = [];
    const out = await deliverInvitations(db, orgAId, hostA,
      { name: 'Act', date: future(3), location: 'S', imageUrl: null },
      [{ invitationId: inv.id, token: inv.token, user: { email: `f5-${stamp}@t.local`, firstName: 'F', lastName: 'U' } }],
      { send: async (m) => { sent.push(m.to); return { id: 'x' }; } });
    expect(out).toMatchObject({ sent: 1, skipped: 0, failed: 0 });
    expect(sent).toEqual([`f5-${stamp}@t.local`]);
    const after = await db.selectFrom('invitations').select('sent_at').where('id', '=', inv.id).executeTakeFirstOrThrow();
    expect(after.sent_at).not.toBeNull();
  });

  it('cancelar: pendiente → 204; respondida → 404; token inventado en público → 404', async () => {
    const u4 = await mkUser(`f4-${stamp}@t.local`);
    await call('POST', `/api/v2/activities/${actCine}/invitations`, { userIds: [u4] }, TOK.admin);
    const inv = await db.selectFrom('invitations').select('id').where('user_id', '=', u4).executeTakeFirstOrThrow();
    expect((await call('POST', `/api/v2/activities/${actCine}/invitations/${inv.id}/cancel`, {}, TOK.admin)).statusCode).toBe(204);
    expect((await call('POST', `/api/v2/activities/${actCine}/invitations/${inv.id}/cancel`, {}, TOK.admin)).statusCode).toBe(404);
    expect((await call('GET', `/api/v2/public/rsvp/token-inventado-${stamp}`)).statusCode).toBe(404);
  });

  it('invite-existing: agrega usuarios del padrón (incluye SIN email); idempotente; owner/admin', async () => {
    const act = await mkAct({ capacity: 50 });
    const u5 = await mkUser(`f5x-${stamp}@t.local`);
    // u5 (con email) + uSinEmail (SIN email) + un id inexistente → 2 invited, 1 skipped
    const r1 = await call('POST', `/api/v2/activities/${act}/invite-existing`,
      { userIds: [u5, uSinEmail, '00000000-0000-0000-0000-000000000000'] }, TOK.admin);
    expect(r1.statusCode).toBe(201);
    expect(r1.json().summary).toMatchObject({ invited: 2, alreadyInvited: 0, skipped: 1 });
    // el SIN email quedó invitado (clave del caso)
    const inv = await db.selectFrom('invitations').select('id').where('activity_id', '=', act).where('user_id', '=', uSinEmail).executeTakeFirst();
    expect(inv).toBeTruthy();
    // re-invitar → alreadyInvited (no duplica)
    const r2 = await call('POST', `/api/v2/activities/${act}/invite-existing`, { userIds: [u5, uSinEmail] }, TOK.admin);
    expect(r2.json().summary).toMatchObject({ invited: 0, alreadyInvited: 2, skipped: 0 });
    const total = await db.selectFrom('invitations').select(db.fn.countAll<string>().as('n')).where('activity_id', '=', act).executeTakeFirstOrThrow();
    expect(Number(total.n)).toBe(2);
    // operator no puede
    expect((await call('POST', `/api/v2/activities/${act}/invite-existing`, { userIds: [u5] }, TOK.operator)).statusCode).toBe(403);
  });
});
