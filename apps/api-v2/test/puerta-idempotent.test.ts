// apps/api-v2/test/puerta-idempotent.test.ts · PR-P2 (PUE-A01, PUE-A11):
// registrar idempotente (Idempotency-Key por sala), auditoría, lastEntryToday /
// aviso de reentrada y Deshacer (10 min para el mismo staff puerta; admin siempre).

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

run('puerta · registrar idempotente + deshacer', () => {
  let db: Kysely<Database>; let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `pid-${stamp}`; const host = `${slug}.contan2.com`;
  const tokAdmin = `pid-adm-${stamp}`; const tokP1 = `pid-p1-${stamp}`; const tokP2 = `pid-p2-${stamp}`;
  let orgId: string; let salaA: string; let salaB: string; let userCode: string; let userId: string;

  const call = (tok: string, method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { host, cookie: `contan2_session=${tok}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { payload: body as object } : {}) });
  const reg = (tok: string, body: unknown, key?: string) => call(tok, 'POST', '/api/v2/puerta/registrar', body, key ? { 'idempotency-key': key } : {});
  const countRows = async (salaId: string) =>
    Number((await db.selectFrom('attendance').select((eb) => eb.fn.countAll<string>().as('n')).where('activity_id', '=', salaId).executeTakeFirstOrThrow()).n);
  const backdate = (id: string, minutes: number) =>
    db.updateTable('attendance').set({ registered_at: new Date(Date.now() - minutes * 60_000).toISOString() } as never).where('id', '=', id).execute();

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'PID' }).returning('id').executeTakeFirstOrThrow()).id;
    const mk = async (role: string, tok: string) => {
      const st = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${tok}@t.local`, password_hash: 'x', full_name: role, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({ staff_member_id: st.id, token_hash: hashToken(tok), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
      return st.id;
    };
    await mk('admin', tokAdmin); await mk('puerta', tokP1); await mk('puerta', tokP2);
    const mkSala = async (name: string) => {
      const id = randomUUID();
      await db.insertInto('activities').values({ id, organization_id: orgId, name, type: 'otro', location: 'Lobby', date: new Date().toISOString(), capacity: 8, enrolled_count: 0, status: 'activa', description: '', image_url: null, is_permanent: true, audience: 'adultos' } as never).execute();
      return id;
    };
    salaA = await mkSala('Sala A'); salaB = await mkSala('Sala B');
    const u = await db.insertInto('users').values({ id: randomUUID(), organization_id: orgId, code: 'PID-AB12CD', first_name: 'Ana', last_name: 'Gómez', email: null, phone: null, visit_count: 3 } as never).returning(['id', 'code']).executeTakeFirstOrThrow();
    userCode = u.code; userId = u.id;
    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('checkin_idempotency').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('misma clave dos veces → 1 fila y replay:true; clave distinta → otra fila', async () => {
    const body = { salaIds: [salaA], mode: 'anonymous' as const };
    const r1 = await reg(tokP1, body, 'k-anon-1');
    expect(r1.statusCode).toBe(201);
    expect(r1.json().replay).toBe(false);
    expect(r1.json().entryIds).toHaveLength(1);
    const r2 = await reg(tokP1, body, 'k-anon-1');
    expect(r2.statusCode).toBe(200);
    expect(r2.json().replay).toBe(true);
    expect(r2.json().entryIds).toEqual(r1.json().entryIds);
    expect(await countRows(salaA)).toBe(1);
    const r3 = await reg(tokP1, body, 'k-anon-2');
    expect(r3.json().replay).toBe(false);
    expect(await countRows(salaA)).toBe(2);
  });

  it('replay de un grupo no duplica; replay de "nuevo visitante" no crea otro usuario', async () => {
    const g = { salaIds: [salaB], mode: 'group' as const, group: { colegio: 'Col X', contactName: 'Prof', studentCount: 4 } };
    await reg(tokP1, g, 'k-g'); const g2 = await reg(tokP1, g, 'k-g');
    expect(g2.json().replay).toBe(true);
    expect(g2.json().registered[0].partySize).toBe(5);
    expect(g2.json().visitor).toBe('Col X (4 alumnos)');
    expect(await countRows(salaB)).toBe(1);

    const nv = { salaIds: [salaB], mode: 'new' as const, visitor: { firstName: 'Sin', lastName: 'Contacto' } };
    const n1 = await reg(tokP1, nv, 'k-nv'); const n2 = await reg(tokP1, nv, 'k-nv');
    expect(n2.json().replay).toBe(true);
    expect(n2.json().code).toBe(n1.json().code);
    const users = await db.selectFrom('users').select((eb) => eb.fn.countAll<string>().as('n')).where('organization_id', '=', orgId).where('last_name', '=', 'Contacto').executeTakeFirstOrThrow();
    expect(users.n).toBe('1');
  });

  it('la clave es por sala: registrar en ambas con una clave; reintento no duplica ninguna', async () => {
    const before = [await countRows(salaA), await countRows(salaB)];
    const body = { salaIds: [salaA, salaB], mode: 'anonymous' as const };
    const r1 = await reg(tokP1, body, 'k-both');
    expect(r1.json().entryIds).toHaveLength(2);
    const r2 = await reg(tokP1, body, 'k-both');
    expect(r2.json().replay).toBe(true);
    expect(r2.json().entryIds).toEqual(r1.json().entryIds);
    expect([await countRows(salaA), await countRows(salaB)]).toEqual([before[0]! + 1, before[1]! + 1]);
    const keys = await db.selectFrom('checkin_idempotency').select('endpoint').where('organization_id', '=', orgId).where('idempotency_key', '=', 'k-both').execute();
    expect(keys.map((k) => k.endpoint).sort()).toEqual([`puerta.registrar:${salaA}`, `puerta.registrar:${salaB}`].sort());
  });

  it('sin Idempotency-Key sigue funcionando (compatibilidad) y cada llamada cuenta', async () => {
    const before = await countRows(salaA);
    expect((await reg(tokP1, { salaIds: [salaA], mode: 'anonymous' })).statusCode).toBe(201);
    expect((await reg(tokP1, { salaIds: [salaA], mode: 'anonymous' })).statusCode).toBe(201);
    expect(await countRows(salaA)).toBe(before + 2);
  });

  it('audita puerta.registered con staff, sala, modo y personas', async () => {
    const r = await reg(tokP1, { salaIds: [salaA], mode: 'anonymous', companions: 2 }, 'k-audit');
    const id = r.json().entryIds[0] as string;
    const row = await db.selectFrom('tenant_audit_log').selectAll().where('organization_id', '=', orgId).where('action', '=', 'puerta.registered').where('target_id', '=', id).executeTakeFirstOrThrow();
    expect(row.actor_role).toBe('puerta');
    expect(row.actor_staff_id).toBeTruthy();
    const meta = row.metadata as unknown as { salaId: string; mode: string; people: number };
    expect(meta).toMatchObject({ salaId: salaA, mode: 'anonymous', people: 3 });
  });

  it('lastEntryToday: null la 1.ª vez; ISO en la siguiente; con checkRecent y <15 min → 409 sin registrar', async () => {
    const r1 = await reg(tokP1, { salaIds: [salaA], mode: 'identified', code: userCode }, 'k-ana-1');
    expect(r1.statusCode).toBe(201);
    expect(r1.json().lastEntryToday).toBeNull();
    const firstId = r1.json().entryIds[0] as string;

    // checkRecent + entró hace instantes → 409 (nada se registra, la clave no se consume).
    const n = await countRows(salaA);
    const r2 = await reg(tokP1, { salaIds: [salaA], mode: 'identified', code: userCode, checkRecent: true }, 'k-ana-2');
    expect(r2.statusCode).toBe(409);
    expect(r2.json().code).toBe('recent_entry');
    expect(typeof r2.json().lastEntryToday).toBe('string');
    expect(await countRows(salaA)).toBe(n);
    // El reintento con confirmación y LA MISMA clave sí registra (la clave no quedó quemada).
    const r3 = await reg(tokP1, { salaIds: [salaA], mode: 'identified', code: userCode }, 'k-ana-2');
    expect(r3.statusCode).toBe(201);
    expect(r3.json().replay).toBe(false);
    expect(typeof r3.json().lastEntryToday).toBe('string');

    // Hace 30-40 min → checkRecent ya no frena, pero lastEntryToday viaja igual.
    await backdate(firstId, 40);
    await backdate(r3.json().entryIds[0], 30);
    const r4 = await reg(tokP1, { salaIds: [salaA], mode: 'identified', code: userCode, checkRecent: true }, 'k-ana-3');
    expect(r4.statusCode).toBe(201);
    expect(new Date(r4.json().lastEntryToday).getTime()).toBeLessThan(Date.now() - 25 * 60_000);

    // Otra sala distinta no se mezcla: nunca entró a B hoy.
    const rb = await reg(tokP1, { salaIds: [salaB], mode: 'identified', code: userCode, checkRecent: true }, 'k-ana-b');
    expect(rb.statusCode).toBe(201);
    expect(rb.json().lastEntryToday).toBeNull();
  });

  describe('deshacer · DELETE /puerta/entries/:id', () => {
    const undo = (tok: string, id: string) => call(tok, 'DELETE', `/api/v2/puerta/entries/${id}`);
    const stats = async () => {
      const r = await call(tokAdmin, 'GET', '/api/v2/puerta/salas');
      return (r.json().salas as { id: string; visitorsToday: number }[]).find((s) => s.id === salaA)!.visitorsToday;
    };

    it('mismo staff a los 5 min → 200: desaparece de stats, baja visit_count, queda auditado', async () => {
      const visits0 = Number((await db.selectFrom('users').select('visit_count').where('id', '=', userId).executeTakeFirstOrThrow()).visit_count);
      const r = await reg(tokP1, { salaIds: [salaA], mode: 'identified', code: userCode, companions: 1 }, 'k-undo-5');
      const id = r.json().entryIds[0] as string;
      await backdate(id, 5);
      const before = await stats();
      const res = await undo(tokP1, id);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, entryId: id, partySize: 2 });
      expect(await stats()).toBe(before - 2);
      expect(await db.selectFrom('attendance').select('id').where('id', '=', id).executeTakeFirst()).toBeUndefined();
      const visits1 = Number((await db.selectFrom('users').select('visit_count').where('id', '=', userId).executeTakeFirstOrThrow()).visit_count);
      expect(visits1).toBe(visits0); // +1 al registrar, -1 al deshacer
      const aud = await db.selectFrom('tenant_audit_log').select(['actor_role']).where('organization_id', '=', orgId).where('action', '=', 'puerta.voided').where('target_id', '=', id).executeTakeFirstOrThrow();
      expect(aud.actor_role).toBe('puerta');
      // Segundo intento → 404 (ya no existe).
      expect((await undo(tokP1, id)).statusCode).toBe(404);
    });

    it('a los 11 min el rol puerta recibe 403; el admin sí puede', async () => {
      const r = await reg(tokP1, { salaIds: [salaA], mode: 'anonymous' }, 'k-undo-11');
      const id = r.json().entryIds[0] as string;
      await backdate(id, 11);
      const forbidden = await undo(tokP1, id);
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json().error).toContain('10 minutos');
      expect((await undo(tokAdmin, id)).statusCode).toBe(200);
    });

    it('otro staff puerta no puede deshacer lo ajeno (aunque sea reciente)', async () => {
      const r = await reg(tokP1, { salaIds: [salaA], mode: 'anonymous' }, 'k-undo-other');
      const id = r.json().entryIds[0] as string;
      const res = await undo(tokP2, id);
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toContain('registraste');
      expect(await db.selectFrom('attendance').select('id').where('id', '=', id).executeTakeFirst()).toBeTruthy();
    });

    it('id inexistente → 404; sin sesión → 401', async () => {
      expect((await undo(tokAdmin, randomUUID())).statusCode).toBe(404);
      expect((await app.inject({ method: 'DELETE', url: `/api/v2/puerta/entries/${randomUUID()}`, headers: { host } })).statusCode).toBe(401);
    });

    it('limitador: ráfaga de deshacer → 429', async () => {
      let limited = false;
      for (let i = 0; i < 40 && !limited; i += 1) limited = (await undo(tokAdmin, randomUUID())).statusCode === 429;
      expect(limited).toBe(true);
    });
  });
});
