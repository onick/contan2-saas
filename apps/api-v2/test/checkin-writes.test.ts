// apps/api-v2/test/checkin-writes.test.ts · integration (skip sin DATABASE_URL).
// Check-in B · ESCRITURA: POST /checkin (existente/nuevo) + /checkin/anonymous.
// Núcleo compartido, capacidad atómica/concurrencia, idempotencia (org,user,act),
// Idempotency-Key anónimo (dedup transaccional), auditoría + rollback si falla,
// roles/401/cross-tenant, actividad llena/finalizada/cancelada, campos prohibidos,
// cero PII en audit.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';

// Audit mockeado pasando-through por defecto; un test lo fuerza a fallar (rollback).
vi.mock('../src/services/checkin-audit.js', async (orig) => {
  const actual = await (orig() as Promise<typeof import('../src/services/checkin-audit.js')>);
  return { writeCheckinAudit: vi.fn(actual.writeCheckinAudit) };
});
import { writeCheckinAudit } from '../src/services/checkin-audit.js';
import { cleanupExpiredCheckinKeys } from '../src/services/checkin-idempotency.js';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('POST /checkin (+/anonymous) · escritura', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `ckw-a-${stamp}`;
  const slugB = `ckw-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { owner: `ckw-own-${stamp}`, admin: `ckw-adm-${stamp}`, operator: `ckw-ope-${stamp}`, b: `ckw-b-${stamp}` };
  const userCode = `TST-AAA${String(stamp).slice(-3)}`;
  let userEmail: string;

  const mkOrg = async (slug: string) => (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };
  const mkActivity = async (orgId: string, name: string, status: 'activa' | 'finalizada' | 'cancelada', capacity: number, enrolled = 0) =>
    (await db.insertInto('activities').values({ id: randomUUID(), organization_id: orgId, name, type: 'concierto', location: 'Sala', date: new Date(Date.now() + 7 * 86_400_000).toISOString(), capacity, enrolled_count: enrolled, status }).returning('id').executeTakeFirstOrThrow()).id;
  const enrolledOf = async (id: string) => Number((await db.selectFrom('activities').select('enrolled_count').where('id', '=', id).executeTakeFirstOrThrow()).enrolled_count);
  const attCount = async (orgId: string) => Number((await db.selectFrom('attendance').select(db.fn.countAll<number>().as('n')).where('organization_id', '=', orgId).executeTakeFirstOrThrow()).n);
  const userIdOf = async (orgId: string, code: string) => (await db.selectFrom('users').select('id').where('organization_id', '=', orgId).where('code', '=', code).executeTakeFirstOrThrow()).id;
  const invCount = async (orgId: string, activityId: string, userId: string) => Number((await db.selectFrom('invitations').select(db.fn.countAll<number>().as('n')).where('organization_id', '=', orgId).where('activity_id', '=', activityId).where('user_id', '=', userId).executeTakeFirstOrThrow()).n);

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');
    userEmail = `evt-${stamp}@ckw.do`;
    await db.insertInto('users').values({ id: randomUUID(), organization_id: orgAId, code: userCode, first_name: 'Eva', last_name: 'Torres', email: userEmail, phone: '809-1', visit_count: 3 }).execute();
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('checkin_idempotency').where('organization_id', '=', id).execute();
      await db.deleteFrom('invitations').where('organization_id', '=', id).execute();
      await db.deleteFrom('protocol_profiles').where('organization_id', '=', id).execute();
      await db.deleteFrom('attendance').where('organization_id', '=', id).execute();
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('users').where('organization_id', '=', id).execute();
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const manual = (body: unknown, token?: string, host = hostA) =>
    app.inject({ method: 'POST', url: '/api/v2/checkin', headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, payload: body as object });
  const anon = (body: unknown, key?: string, token?: string, host = hostA) =>
    app.inject({ method: 'POST', url: '/api/v2/checkin/anonymous', headers: { host, 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}), ...(token ? { cookie: `contan2_session=${token}` } : {}) }, payload: body as object });

  // ── manual ──
  it('existente por código → 201, mode existing, visit_count+1, enrolled+1', async () => {
    const act = await mkActivity(orgAId, 'Existente código', 'activa', 50);
    const res = await manual({ activityId: act, visitor: { code: userCode }, companionsChildren: 0 }, TOK.admin);
    expect(res.statusCode).toBe(201);
    const b = res.json();
    expect(b.mode).toBe('existing');
    expect(b.visitCount).toBe(4); // 3 + 1
    expect(await enrolledOf(act)).toBe(1);
  });

  it('existente por email → 201', async () => {
    const act = await mkActivity(orgAId, 'Existente email', 'activa', 50);
    expect((await manual({ activityId: act, visitor: { email: userEmail }, companionsChildren: 0 }, TOK.admin)).statusCode).toBe(201);
  });

  it('nuevo inline → 201 mode new, crea usuario con código', async () => {
    const act = await mkActivity(orgAId, 'Nuevo inline', 'activa', 50);
    const res = await manual({ activityId: act, visitor: { new: { firstName: 'Nuevo', lastName: 'Visitante', email: `nuevo-${stamp}@ckw.do` } }, companionsChildren: 0 }, TOK.admin);
    expect(res.statusCode).toBe(201);
    const b = res.json();
    expect(b.mode).toBe('new');
    expect(b.code).toMatch(/^TST-/);
    expect(b.visitCount).toBe(1);
  });

  it('companions: partySize y enrolled reflejan 1 + niños', async () => {
    const act = await mkActivity(orgAId, 'Companions', 'activa', 50);
    const res = await manual({ activityId: act, visitor: { new: { firstName: 'Adulto', lastName: 'ConNinos' } }, companionsChildren: 3 }, TOK.admin);
    expect(res.json().partySize).toBe(4);
    expect(await enrolledOf(act)).toBe(4);
  });

  it('addToList: admite a un EXISTENTE no invitado → crea la invitación (aparece en la lista) + asistencia; operator OK', async () => {
    const act = await mkActivity(orgAId, 'AddToList existente', 'activa', 50);
    const uid = await userIdOf(orgAId, userCode);
    expect(await invCount(orgAId, act, uid)).toBe(0); // antes: sin invitación
    const res = await manual({ activityId: act, visitor: { code: userCode }, companionsChildren: 0, addToList: true }, TOK.operator);
    expect(res.statusCode).toBe(201);
    expect(await invCount(orgAId, act, uid)).toBe(1); // ahora figura en la lista
    expect((await db.selectFrom('invitations').select('kind').where('organization_id', '=', orgAId).where('activity_id', '=', act).where('user_id', '=', uid).executeTakeFirstOrThrow()).kind).toBe('audience');
    expect(await enrolledOf(act)).toBe(1);
  });

  it('addToList con NUEVO visitante → crea usuario + invitación + asistencia', async () => {
    const act = await mkActivity(orgAId, 'AddToList nuevo', 'activa', 50);
    const res = await manual({ activityId: act, visitor: { new: { firstName: 'Walk', lastName: 'In' } }, companionsChildren: 0, addToList: true }, TOK.operator);
    expect(res.statusCode).toBe(201);
    const uid = await userIdOf(orgAId, res.json().code);
    expect(await invCount(orgAId, act, uid)).toBe(1);
  });

  it('addToList hereda protocolo si la persona ya es de protocolo (kind=protocol)', async () => {
    const act = await mkActivity(orgAId, 'AddToList proto', 'activa', 50);
    const uid = await userIdOf(orgAId, userCode);
    await db.insertInto('protocol_profiles').values({ user_id: uid, organization_id: orgAId, category: 'autoridad', active: true })
      .onConflict((oc) => oc.column('user_id').doUpdateSet({ active: true })).execute();
    const res = await manual({ activityId: act, visitor: { code: userCode }, companionsChildren: 0, addToList: true }, TOK.admin);
    expect(res.statusCode).toBe(201);
    expect((await db.selectFrom('invitations').select('kind').where('organization_id', '=', orgAId).where('activity_id', '=', act).where('user_id', '=', uid).executeTakeFirstOrThrow()).kind).toBe('protocol');
    await db.deleteFrom('protocol_profiles').where('user_id', '=', uid).execute(); // no contaminar otros tests
  });

  it('duplicado del mismo visitante en la actividad → 409 (sin oversell)', async () => {
    const act = await mkActivity(orgAId, 'Dup', 'activa', 50);
    expect((await manual({ activityId: act, visitor: { code: userCode }, companionsChildren: 0 }, TOK.admin)).statusCode).toBe(201);
    expect((await manual({ activityId: act, visitor: { code: userCode }, companionsChildren: 0 }, TOK.admin)).statusCode).toBe(409);
    expect(await enrolledOf(act)).toBe(1); // no incrementó de nuevo
  });

  it('actividad llena → 409; finalizada/cancelada → 409', async () => {
    const full = await mkActivity(orgAId, 'Llena', 'activa', 1, 1);
    expect((await manual({ activityId: full, visitor: { code: userCode }, companionsChildren: 0 }, TOK.admin)).statusCode).toBe(409);
    const fin = await mkActivity(orgAId, 'Fin', 'finalizada', 50);
    expect((await manual({ activityId: fin, visitor: { code: userCode }, companionsChildren: 0 }, TOK.admin)).statusCode).toBe(409);
    const can = await mkActivity(orgAId, 'Can', 'cancelada', 50);
    expect((await manual({ activityId: can, visitor: { code: userCode }, companionsChildren: 0 }, TOK.admin)).statusCode).toBe(409);
  });

  it('campos prohibidos (organizationId/status/enrolledCount/userId) → 400', async () => {
    const act = await mkActivity(orgAId, 'Prohibidos', 'activa', 50);
    for (const bad of [{ organizationId: orgBId }, { status: 'activa' }, { enrolledCount: 1 }, { userId: 'x' }]) {
      const res = await manual({ activityId: act, visitor: { code: userCode }, companionsChildren: 0, ...bad }, TOK.admin);
      expect(res.statusCode).toBe(400);
    }
  });

  it('roles: owner/admin/operator pueden registrar (201)', async () => {
    for (const t of [TOK.owner, TOK.admin, TOK.operator]) {
      const act = await mkActivity(orgAId, `Rol ${t}`, 'activa', 50);
      expect((await manual({ activityId: act, visitor: { new: { firstName: 'R', lastName: t.slice(-4) } }, companionsChildren: 0 }, t)).statusCode).toBe(201);
    }
  });

  it('sin sesión → 401; cross-tenant (staff B en host A) → 403', async () => {
    const act = await mkActivity(orgAId, 'Auth', 'activa', 50);
    expect((await manual({ activityId: act, visitor: { code: userCode }, companionsChildren: 0 })).statusCode).toBe(401);
    expect((await manual({ activityId: act, visitor: { code: userCode }, companionsChildren: 0 }, TOK.b)).statusCode).toBe(403);
  });

  it('auditoría: fila con actor enmascarado, acción y SIN PII; ip hasheada', async () => {
    const act = await mkActivity(orgAId, 'Audit', 'activa', 50);
    const before = Number((await db.selectFrom('tenant_audit_log').select(db.fn.countAll<number>().as('n')).where('organization_id', '=', orgAId).where('action', '=', 'checkin.manual').executeTakeFirstOrThrow()).n);
    await manual({ activityId: act, visitor: { new: { firstName: 'Aud', lastName: 'It', email: `aud-${stamp}@ckw.do` } }, companionsChildren: 0 }, TOK.admin);
    const row = await db.selectFrom('tenant_audit_log').selectAll().where('organization_id', '=', orgAId).where('action', '=', 'checkin.manual').orderBy('id', 'desc').executeTakeFirstOrThrow();
    expect(row.actor_email_masked).toMatch(/^a\*\*\*@/); // admin-…@t.local enmascarado
    expect(row.actor_email_masked).not.toContain('@t.local'.replace('@', 'x')); // sin local part completo
    expect(row.actor_role).toBe('admin');
    expect(row.ip_hash).toBeTruthy();
    expect(JSON.stringify(row.metadata)).not.toMatch(/@ckw\.do|809-/); // cero PII de visitante
    expect(Number((await db.selectFrom('tenant_audit_log').select(db.fn.countAll<number>().as('n')).where('organization_id', '=', orgAId).where('action', '=', 'checkin.manual').executeTakeFirstOrThrow()).n)).toBe(before + 1);
  });

  it('fallo de auditoría → ROLLBACK de asistencia y capacidad', async () => {
    const act = await mkActivity(orgAId, 'AuditRollback', 'activa', 50);
    const atts0 = await attCount(orgAId);
    vi.mocked(writeCheckinAudit).mockRejectedValueOnce(new Error('audit caído'));
    const res = await manual({ activityId: act, visitor: { new: { firstName: 'RB', lastName: 'Test' } }, companionsChildren: 0 }, TOK.admin);
    expect(res.statusCode).toBe(500);
    expect(await enrolledOf(act)).toBe(0); // capacidad sin tocar
    expect(await attCount(orgAId)).toBe(atts0); // sin asistencia
  });

  // ── anonymous ──
  it('anónimo → 201, una asistencia anónima, enrolled+1, sin usuario', async () => {
    const act = await mkActivity(orgAId, 'Anon', 'activa', 50);
    const res = await anon({ activityId: act }, randomUUID(), TOK.admin);
    expect(res.statusCode).toBe(201);
    const b = res.json();
    expect(b.mode).toBe('anonymous');
    expect(b.replay).toBe(false);
    expect(await enrolledOf(act)).toBe(1);
    const row = await db.selectFrom('attendance').select(['user_id', 'user_code', 'anonymous']).where('id', '=', b.attendanceId).executeTakeFirstOrThrow();
    expect(row.user_id).toBe(null);
    expect(row.user_code).toBe(null);
    expect(row.anonymous).toBe(true);
  });

  it('anónimo sin Idempotency-Key → 400', async () => {
    const act = await mkActivity(orgAId, 'AnonNoKey', 'activa', 50);
    expect((await anon({ activityId: act }, undefined, TOK.admin)).statusCode).toBe(400);
  });

  it('misma Idempotency-Key → no duplica (replay 200, mismo attendanceId, enrolled +1 una vez)', async () => {
    const act = await mkActivity(orgAId, 'AnonIdem', 'activa', 50);
    const key = randomUUID();
    const r1 = await anon({ activityId: act }, key, TOK.admin);
    const r2 = await anon({ activityId: act }, key, TOK.admin);
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(200);
    expect(r2.json().replay).toBe(true);
    expect(r1.json().attendanceId).toBe(r2.json().attendanceId);
    expect(await enrolledOf(act)).toBe(1); // sólo una vez
  });

  it('keys distintas crean entradas distintas hasta capacidad, luego 409', async () => {
    const act = await mkActivity(orgAId, 'AnonCap', 'activa', 3);
    expect((await anon({ activityId: act }, randomUUID(), TOK.admin)).statusCode).toBe(201);
    expect((await anon({ activityId: act }, randomUUID(), TOK.admin)).statusCode).toBe(201);
    expect((await anon({ activityId: act }, randomUUID(), TOK.admin)).statusCode).toBe(201);
    expect((await anon({ activityId: act }, randomUUID(), TOK.admin)).statusCode).toBe(409); // llena
    expect(await enrolledOf(act)).toBe(3);
  });

  it('concurrencia: cupo 2, 3 anónimos en paralelo → 2×201 + 1×409, sin oversell', async () => {
    const act = await mkActivity(orgAId, 'AnonConc', 'activa', 2);
    const results = await Promise.all([randomUUID(), randomUUID(), randomUUID()].map((k) => anon({ activityId: act }, k, TOK.admin)));
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 201, 409]);
    expect(await enrolledOf(act)).toBe(2); // sin oversell
  });

  it('anónimo: 401 sin sesión, 403 cross-tenant, operator 201', async () => {
    const act = await mkActivity(orgAId, 'AnonAuth', 'activa', 50);
    expect((await anon({ activityId: act }, randomUUID())).statusCode).toBe(401);
    expect((await anon({ activityId: act }, randomUUID(), TOK.b)).statusCode).toBe(403);
    expect((await anon({ activityId: act }, randomUUID(), TOK.operator)).statusCode).toBe(201);
  });

  // ── hardening: replay/idempotencia ──
  it('replay NO crea un segundo evento de auditoría (sólo el 1er éxito audita)', async () => {
    const act = await mkActivity(orgAId, 'AnonAudit', 'activa', 50);
    const key = randomUUID();
    const auditN = async () => Number((await db.selectFrom('tenant_audit_log').select(db.fn.countAll<number>().as('n')).where('organization_id', '=', orgAId).where('action', '=', 'checkin.anonymous').executeTakeFirstOrThrow()).n);
    const before = await auditN();
    await anon({ activityId: act }, key, TOK.admin); // éxito → 1 audit
    expect(await auditN()).toBe(before + 1);
    const replay = await anon({ activityId: act }, key, TOK.admin); // replay → 0 audit nuevo
    expect(replay.json().replay).toBe(true);
    expect(await auditN()).toBe(before + 1);
  });

  it('replay sigue exigiendo auth: sin sesión → 401; cross-tenant → 403 (antes del replay)', async () => {
    const act = await mkActivity(orgAId, 'AnonReplayAuth', 'activa', 50);
    const key = randomUUID();
    expect((await anon({ activityId: act }, key, TOK.admin)).statusCode).toBe(201);
    expect((await anon({ activityId: act }, key)).statusCode).toBe(401); // misma key, sin sesión → 401
    expect((await anon({ activityId: act }, key, TOK.b)).statusCode).toBe(403); // staff B en host A → 403
  });

  it('key EXPIRADA se puede reclamar (nueva asistencia, enrolled +1 otra vez)', async () => {
    const act = await mkActivity(orgAId, 'AnonExpire', 'activa', 50);
    const key = randomUUID();
    const r1 = await anon({ activityId: act }, key, TOK.admin);
    expect(r1.statusCode).toBe(201);
    expect(await enrolledOf(act)).toBe(1);
    // Forzar expiración de la key.
    await db.updateTable('checkin_idempotency').set({ expires_at: new Date(Date.now() - 3_600_000).toISOString() }).where('idempotency_key', '=', key).execute();
    const r2 = await anon({ activityId: act }, key, TOK.admin); // reclama → nueva
    expect(r2.statusCode).toBe(201);
    expect(r2.json().replay).toBe(false);
    expect(r2.json().attendanceId).not.toBe(r1.json().attendanceId);
    expect(await enrolledOf(act)).toBe(2); // se registró de nuevo
  });

  it('fallo de auditoría en anónimo → ROLLBACK del claim (key NO persiste, retry funciona)', async () => {
    const act = await mkActivity(orgAId, 'AnonAuditRb', 'activa', 50);
    const key = randomUUID();
    vi.mocked(writeCheckinAudit).mockRejectedValueOnce(new Error('audit caído'));
    expect((await anon({ activityId: act }, key, TOK.admin)).statusCode).toBe(500);
    expect(await enrolledOf(act)).toBe(0); // sin reserva
    const exists = await db.selectFrom('checkin_idempotency').select('attendance_id').where('idempotency_key', '=', key).executeTakeFirst();
    expect(exists).toBeUndefined(); // claim revertido
    // Retry con la MISMA key (audit ya funciona) → éxito fresco.
    const retry = await anon({ activityId: act }, key, TOK.admin);
    expect(retry.statusCode).toBe(201);
    expect(retry.json().replay).toBe(false);
    expect(await enrolledOf(act)).toBe(1);
  });

  it('cleanup por lotes borra sólo las keys expiradas, respeta batchSize', async () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    for (let i = 0; i < 5; i++) {
      await db.insertInto('checkin_idempotency').values({ organization_id: orgAId, endpoint: 'cleanup-test', idempotency_key: `exp-${stamp}-${i}`, attendance_id: randomUUID(), expires_at: past }).execute();
    }
    await db.insertInto('checkin_idempotency').values({ organization_id: orgAId, endpoint: 'cleanup-test', idempotency_key: `keep-${stamp}`, attendance_id: randomUUID(), expires_at: future }).execute();
    const liveBefore = async () => Number((await db.selectFrom('checkin_idempotency').select(db.fn.countAll<number>().as('n')).where('endpoint', '=', 'cleanup-test').where('expires_at', '>', new Date().toISOString()).executeTakeFirstOrThrow()).n);
    expect(await liveBefore()).toBe(1);
    const first = await cleanupExpiredCheckinKeys(db, 3); // lote de 3
    expect(first).toBe(3);
    const second = await cleanupExpiredCheckinKeys(db, 100);
    expect(second).toBe(2); // las 2 expiradas restantes
    const third = await cleanupExpiredCheckinKeys(db, 100);
    expect(third).toBe(0); // no quedan expiradas
    expect(await liveBefore()).toBe(1); // la no-expirada sigue
  });
});
