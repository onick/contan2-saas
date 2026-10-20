// apps/api-v2/test/puerta-entries.test.ts · PR-P4 (PUE-A04): GET /puerta/entries
// (entradas del día en REPORT_TZ, sin PII, por sala, RBAC, paginación, borde de
// medianoche RD) y GET /puerta/bookings/:id/history + PATCH action:'edit'.

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createDb, type Database } from '@contan2/db';
import type { Kysely } from 'kysely';
import { buildApp } from '../src/server.js';
import { hashToken } from '@contan2/auth';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('puerta · entradas del día + historial de la reserva', () => {
  let db: Kysely<Database>; let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `pen-${stamp}`; const host = `${slug}.contan2.com`; const hostB = `penb-${stamp}.contan2.com`;
  const tok = { admin: `pen-adm-${stamp}`, p1: `pen-p1-${stamp}`, p2: `pen-p2-${stamp}`, cons: `pen-con-${stamp}`, prot: `pen-pro-${stamp}`, b: `pen-b-${stamp}` };
  const staffId: Record<string, string> = {};
  let orgId: string; let orgB: string; let salaA: string; let salaB: string;

  const call = (t: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown, h = host) =>
    app.inject({ method, url, headers: { host: h, cookie: `contan2_session=${t}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, ...(body !== undefined ? { payload: body as object } : {}) });
  const entries = (t: string, qs: string) => call(t, 'GET', `/api/v2/puerta/entries${qs}`);

  // Borde de medianoche RD (UTC-4, sin DST): 2026-10-20 en RD = [04:00Z del 20, 04:00Z del 21).
  const DAY = '2026-10-20';
  const T = {
    prevLast: '2026-10-20T03:59:59.000Z',   // 19 oct 23:59:59 RD → NO es del 20
    first: '2026-10-20T04:00:00.000Z',      // 20 oct 00:00:00 RD
    mid: '2026-10-20T15:30:00.000Z',        // 11:30 RD
    last: '2026-10-21T03:59:59.000Z',       // 20 oct 23:59:59 RD
    nextFirst: '2026-10-21T04:00:00.000Z',  // 21 oct 00:00 RD → NO
  };
  const ids: Record<string, string> = {};

  async function seedEntry(key: string, salaId: string, salaName: string, at: string, over: Record<string, unknown> = {}, regBy?: string) {
    const id = randomUUID(); ids[key] = id;
    await db.insertInto('attendance').values({
      id, organization_id: orgId, activity_id: salaId, activity_name: salaName, checked_in_at: at, anonymous: true,
      companions_children: 0, companions_adults: 0, is_permanent: true, ...over,
    } as never).execute();
    if (regBy) {
      await db.insertInto('tenant_audit_log').values({
        organization_id: orgId, actor_staff_id: staffId[regBy], actor_email_masked: null, actor_role: regBy === 'admin' ? 'admin' : 'puerta',
        action: 'puerta.registered', target_type: 'attendance', target_id: id, target_label: salaName, metadata: JSON.stringify({ salaId }),
      } as never).execute();
    }
  }

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'PEN' }).returning('id').executeTakeFirstOrThrow()).id;
    orgB = (await db.insertInto('organizations').values({ slug: `penb-${stamp}`, name: 'Org B', status: 'active', code_prefix: 'PNB' }).returning('id').executeTakeFirstOrThrow()).id;
    const mk = async (org: string, role: string, t: string, key: string) => {
      const st = await db.insertInto('staff_members').values({ organization_id: org, email: `${key}-${stamp}@t.local`, password_hash: 'x', full_name: `Staff ${key}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({ staff_member_id: st.id, token_hash: hashToken(t), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
      staffId[key] = st.id;
    };
    await mk(orgId, 'admin', tok.admin, 'admin'); await mk(orgId, 'puerta', tok.p1, 'p1'); await mk(orgId, 'puerta', tok.p2, 'p2');
    await mk(orgId, 'consulta', tok.cons, 'cons'); await mk(orgId, 'protocolo', tok.prot, 'prot'); await mk(orgB, 'admin', tok.b, 'b');
    const mkSala = async (name: string, aforo: number) => {
      const id = randomUUID();
      await db.insertInto('activities').values({ id, organization_id: orgId, name, type: 'otro', location: 'Lobby', date: new Date().toISOString(), capacity: aforo, enrolled_count: 0, status: 'activa', description: '', image_url: null, is_permanent: true } as never).execute();
      return id;
    };
    salaA = await mkSala('Ada', 1000); salaB = await mkSala('Sala VR', 8);
    const u = await db.insertInto('users').values({ id: randomUUID(), organization_id: orgId, code: 'PEN-AB12CD', first_name: 'Ana', last_name: 'Gómez', email: 'ana@secreto.do', phone: '809-555-0101', visit_count: 1 } as never).returning(['id', 'code']).executeTakeFirstOrThrow();

    await seedEntry('prevLast', salaA, 'Ada', T.prevLast, {}, 'p1');
    await seedEntry('first', salaA, 'Ada', T.first, { companions_adults: 1 }, 'p1');
    await seedEntry('mid', salaA, 'Ada', T.mid, { anonymous: false, user_id: u.id, user_code: u.code, companions_adults: 2 }, 'p2');
    await seedEntry('grp', salaB, 'Sala VR', T.mid, { group_label: 'Colegio San José', group_kind: null, group_contact: 'Prof. Eva', companions_children: 20 }, 'admin');
    await seedEntry('last', salaB, 'Sala VR', T.last, {}, 'p1');
    await seedEntry('nextFirst', salaA, 'Ada', T.nextFirst, {}, 'p1');
    // Fila sin auditoría (histórica): registeredBy = null.
    await seedEntry('noaudit', salaA, 'Ada', '2026-10-20T16:00:00.000Z');
    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgId, orgB]) {
      if (!id) continue;
      await db.deleteFrom('space_bookings').where('organization_id', '=', id).execute();
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('attendance').where('organization_id', '=', id).execute();
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('users').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  describe('GET /puerta/entries', () => {
    it('lista el día en hora de RD: incluye 00:00:00 y 23:59:59, excluye 23:59:59 del día anterior y 00:00 del siguiente', async () => {
      const r = await entries(tok.admin, `?date=${DAY}`);
      expect(r.statusCode, r.body).toBe(200);
      const got = (r.json().entries as { id: string }[]).map((e) => e.id).sort();
      expect(got).toEqual([ids.first, ids.mid, ids.grp, ids.last, ids.noaudit].sort());
      expect(r.json().total).toBe(5);
      expect(r.json().date).toBe(DAY);
    });

    it('ordena de la más reciente a la más antigua y suma personas', async () => {
      const j = (await entries(tok.admin, `?date=${DAY}`)).json();
      const ats = (j.entries as { at: string }[]).map((e) => e.at);
      expect([...ats].sort().reverse()).toEqual(ats);
      // first 2 + mid 3 + grp 21 + last 1 + noaudit 1
      expect(j.people).toBe(28);
    });

    it('no expone correo ni teléfono; sí nombre, código, modo y quién registró', async () => {
      const r = await entries(tok.admin, `?date=${DAY}`);
      expect(r.body).not.toContain('ana@secreto.do');
      expect(r.body).not.toContain('809-555-0101');
      const e = (r.json().entries as Record<string, unknown>[]);
      const mid = e.find((x) => x.id === ids.mid)!;
      expect(mid).toMatchObject({ mode: 'identified', name: 'Ana Gómez', code: 'PEN-AB12CD', people: 3, salaName: 'Ada', registeredBy: 'Staff p2' });
      expect(Object.keys(mid).sort()).toEqual(['at', 'canUndo', 'code', 'groupKind', 'id', 'mode', 'name', 'people', 'registeredBy', 'salaId', 'salaName'].sort());
      const grp = e.find((x) => x.id === ids.grp)!;
      expect(grp).toMatchObject({ mode: 'group', name: 'Colegio San José', people: 21, registeredBy: 'Staff admin' });
      const anon = e.find((x) => x.id === ids.first)!;
      expect(anon).toMatchObject({ mode: 'anonymous', name: null, code: null, people: 2 });
      expect(e.find((x) => x.id === ids.noaudit)!.registeredBy).toBeNull();
    });

    it('filtra por sala', async () => {
      const r = await entries(tok.admin, `?date=${DAY}&salaId=${salaB}`);
      const got = (r.json().entries as { id: string }[]).map((x) => x.id).sort();
      expect(got).toEqual([ids.grp, ids.last].sort());
      expect(r.json().total).toBe(2);
    });

    it('pagina con limit/offset sin perder el total', async () => {
      const p1 = (await entries(tok.admin, `?date=${DAY}&limit=2&offset=0`)).json();
      const p2 = (await entries(tok.admin, `?date=${DAY}&limit=2&offset=2`)).json();
      const p3 = (await entries(tok.admin, `?date=${DAY}&limit=2&offset=4`)).json();
      expect(p1.total).toBe(5);
      expect([p1.entries.length, p2.entries.length, p3.entries.length]).toEqual([2, 2, 1]);
      const all = [...p1.entries, ...p2.entries, ...p3.entries].map((x: { id: string }) => x.id);
      expect(new Set(all).size).toBe(5);
    });

    it('sin date usa hoy (200) y valida el formato', async () => {
      expect((await entries(tok.admin, '')).statusCode).toBe(200);
      expect((await entries(tok.admin, '?date=20-10-2026')).statusCode).toBe(400);
      expect((await entries(tok.admin, '?date=2026-02-31')).statusCode).toBe(400);
    });

    it('RBAC: puerta/consulta leen; protocolo y anónimos no; aislado por tenant', async () => {
      expect((await entries(tok.p1, `?date=${DAY}`)).statusCode).toBe(200);
      expect((await entries(tok.cons, `?date=${DAY}`)).statusCode).toBe(200);
      expect((await entries(tok.prot, `?date=${DAY}`)).statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: `/api/v2/puerta/entries?date=${DAY}`, headers: { host } })).statusCode).toBe(401);
      const other = await call(tok.b, 'GET', `/api/v2/puerta/entries?date=${DAY}`, undefined, hostB);
      expect(other.statusCode).toBe(200);
      expect(other.json().entries).toHaveLength(0);
    });

    it('canUndo: admin siempre; puerta solo lo suyo y dentro de 10 min; consulta nunca', async () => {
      const fresh = randomUUID();
      await db.insertInto('attendance').values({ id: fresh, organization_id: orgId, activity_id: salaA, activity_name: 'Ada', checked_in_at: new Date().toISOString(), anonymous: true, companions_children: 0, companions_adults: 0, is_permanent: true } as never).execute();
      await db.insertInto('tenant_audit_log').values({ organization_id: orgId, actor_staff_id: staffId.p1, actor_email_masked: null, actor_role: 'puerta', action: 'puerta.registered', target_type: 'attendance', target_id: fresh, target_label: 'Ada', metadata: '{}' } as never).execute();
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
      const can = async (t: string, id: string) => ((await entries(t, `?date=${today}`)).json().entries as { id: string; canUndo: boolean }[]).find((e) => e.id === id)?.canUndo;
      expect(await can(tok.admin, fresh)).toBe(true);
      expect(await can(tok.p1, fresh)).toBe(true);
      expect(await can(tok.p2, fresh)).toBe(false);      // otro staff
      expect(await can(tok.cons, fresh)).toBe(false);    // solo lectura
      await db.updateTable('attendance').set({ registered_at: new Date(Date.now() - 11 * 60_000).toISOString() } as never).where('id', '=', fresh).execute();
      expect(await can(tok.p1, fresh)).toBe(false);      // pasaron 11 min
      expect(await can(tok.admin, fresh)).toBe(true);
    });
  });

  describe('historial y edición de la reserva', () => {
    let bookingId: string;
    const mkBooking = async () => (await db.insertInto('space_bookings').values({
      organization_id: orgId, activity_id: salaB, scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(), colegio: 'Colegio Historial',
      contact_name: 'Prof. Hist', contact_email: null, student_count: 10, status: 'scheduled',
    } as never).returning('id').executeTakeFirstOrThrow()).id;

    it('devuelve las filas puerta.booking.* de ESA reserva, en orden, con el nombre del staff', async () => {
      bookingId = await mkBooking();
      const other = await mkBooking();
      expect((await call(tok.admin, 'PATCH', `/api/v2/puerta/bookings/${bookingId}`, { action: 'confirm' })).statusCode).toBe(200);
      expect((await call(tok.p1, 'PATCH', `/api/v2/puerta/bookings/${other}`, { action: 'confirm' })).statusCode).toBe(200);
      expect((await call(tok.p1, 'PATCH', `/api/v2/puerta/bookings/${bookingId}`, { action: 'reschedule', scheduledAt: new Date(Date.now() + 5 * 86400000).toISOString() })).statusCode).toBe(200);
      const r = await call(tok.p2, 'GET', `/api/v2/puerta/bookings/${bookingId}/history`);
      expect(r.statusCode, r.body).toBe(200);
      const h = r.json().history as { action: string; actor: string | null; at: string; metadata: Record<string, unknown> }[];
      expect(h.map((x) => x.action)).toEqual(['confirmed', 'rescheduled']);
      expect(h.map((x) => x.actor)).toEqual(['Staff admin', 'Staff p1']);
      expect(h[1]!.metadata).toHaveProperty('from');
    });

    it('404 si la reserva es de otro tenant; 403 sin rol de lectura', async () => {
      expect((await call(tok.b, 'GET', `/api/v2/puerta/bookings/${bookingId}/history`, undefined, hostB)).statusCode).toBe(404);
      expect((await call(tok.prot, 'GET', `/api/v2/puerta/bookings/${bookingId}/history`)).statusCode).toBe(403);
      expect((await call(tok.p1, 'GET', `/api/v2/puerta/bookings/${randomUUID()}/history`)).statusCode).toBe(404);
    });

    it('PATCH action:edit corrige datos sin cambiar el estado y audita "edited"; terminal → 409', async () => {
      const id = await mkBooking();
      const res = await call(tok.p1, 'PATCH', `/api/v2/puerta/bookings/${id}`, { action: 'edit', edit: { colegio: 'Colegio Nuevo', studentCount: 14, notes: 'Llegan en guagua', contactPhone: '809-555-0000' } });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().booking).toMatchObject({ colegio: 'Colegio Nuevo', studentCount: 14, notes: 'Llegan en guagua', contactPhone: '809-555-0000', status: 'scheduled', contactName: 'Prof. Hist' });
      const h = (await call(tok.p1, 'GET', `/api/v2/puerta/bookings/${id}/history`)).json().history as { action: string; metadata: { fields?: string[] } }[];
      expect(h.map((x) => x.action)).toEqual(['edited']);
      expect(h[0]!.metadata.fields).toEqual(expect.arrayContaining(['colegio', 'studentCount']));
      await db.updateTable('space_bookings').set({ status: 'cancelled' } as never).where('id', '=', id).execute();
      expect((await call(tok.p1, 'PATCH', `/api/v2/puerta/bookings/${id}`, { action: 'edit', edit: { colegio: 'X' } })).statusCode).toBe(409);
    });

    it('edit sin campos → 400; consulta → 403', async () => {
      const id = await mkBooking();
      expect((await call(tok.p1, 'PATCH', `/api/v2/puerta/bookings/${id}`, { action: 'edit' })).statusCode).toBe(400);
      expect((await call(tok.p1, 'PATCH', `/api/v2/puerta/bookings/${id}`, { action: 'edit', edit: {} })).statusCode).toBe(400);
      expect((await call(tok.cons, 'PATCH', `/api/v2/puerta/bookings/${id}`, { action: 'edit', edit: { colegio: 'Z' } })).statusCode).toBe(403);
    });
  });
});
