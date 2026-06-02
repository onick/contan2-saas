// apps/api-v2/test/public-checkin.test.ts · integration (skip sin DATABASE_URL).
// POST /api/v2/public/checkin (ESCRITURA). Cubre: nuevo (código real), hallado
// por código/corto/email, duplicado→409 (capacidad intacta), cupo lleno→409,
// companionsChildren=2 → partySize 3, concurrencia sin oversell, aislamiento por
// tenant. Cada test usa un remoteAddress distinto para no compartir rate-limit.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { PublicCheckinResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('POST /public/checkin · escritura', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `chk-a-${stamp}`;
  const slugB = `chk-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;

  // actividades (id fijo por nombre lógico)
  const A = {
    main: randomUUID(), new: randomUUID(), party: randomUUID(), dup: randomUUID(),
    full: randomUUID(), race: randomUUID(),
  };
  const actB = randomUUID();

  const mkOrg = async (slug: string, codePrefix?: string) => {
    const o = await db.insertInto('organizations').values({
      slug, name: `Org ${slug}`, status: 'active', ...(codePrefix ? { code_prefix: codePrefix } : {}),
    }).returning('id').executeTakeFirstOrThrow();
    return o.id;
  };
  const mkUser = async (orgId: string, code: string, email: string | null, visitCount = 0) =>
    db.insertInto('users').values({
      id: randomUUID(), organization_id: orgId, code, first_name: 'X', last_name: 'Y', email, visit_count: visitCount,
    }).execute();
  const mkAct = async (id: string, orgId: string, name: string, capacity: number, enrolled: number, status = 'activa' as const) =>
    db.insertInto('activities').values({
      id, organization_id: orgId, name, type: 'cine', location: 'Sala', date: new Date().toISOString(),
      capacity, enrolled_count: enrolled, status,
    }).execute();

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA, 'CCB');
    orgBId = await mkOrg(slugB);

    await mkUser(orgAId, 'CCB-CODE01', null);
    await mkUser(orgAId, 'CCB-SHRT01', null);
    await mkUser(orgAId, 'CCB-MAIL01', 'mail@a.do');
    await mkUser(orgAId, 'CCB-DUP001', null);
    await mkUser(orgAId, 'CCB-FULL01', null);
    await mkUser(orgBId, 'MEM-B00001', 'b@b.do');

    await mkAct(A.main, orgAId, 'Main', 100, 0);
    await mkAct(A.new, orgAId, 'Nueva', 100, 0);
    await mkAct(A.party, orgAId, 'Party', 100, 0);
    await mkAct(A.dup, orgAId, 'Dup', 100, 0);
    await mkAct(A.full, orgAId, 'Full', 3, 3);
    await mkAct(A.race, orgAId, 'Race', 1, 0);
    await mkAct(actB, orgBId, 'Ajena', 100, 0);

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
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const post = (body: unknown, ip: string, host = hostA) =>
    app.inject({ method: 'POST', url: '/api/v2/public/checkin', headers: { host, 'content-type': 'application/json' }, payload: body as object, remoteAddress: ip });
  const enrolled = async (id: string) =>
    (await db.selectFrom('activities').select('enrolled_count').where('id', '=', id).executeTakeFirstOrThrow()).enrolled_count;

  it('visitante NUEVO → código real canónico + cupo descontado', async () => {
    const res = await post({ activityId: A.new, visitor: { new: { firstName: 'Ana', lastName: 'Gómez' } }, companionsChildren: 0 }, '10.0.0.1');
    expect(res.statusCode).toBe(200);
    const body = PublicCheckinResponseSchema.parse(res.json());
    expect(body.code).toMatch(/^CCB-[0-9A-Z]{6}$/);
    expect(body.partySize).toBe(1);
    expect(body.visitCount).toBe(1);
    expect(await enrolled(A.new)).toBe(1);
  });

  it('visitante por código COMPLETO', async () => {
    const res = await post({ activityId: A.main, visitor: { code: 'CCB-CODE01' }, companionsChildren: 0 }, '10.0.0.2');
    expect(res.statusCode).toBe(200);
    expect(PublicCheckinResponseSchema.parse(res.json()).code).toBe('CCB-CODE01');
  });

  it('visitante por código CORTO (prefijo del tenant)', async () => {
    const res = await post({ activityId: A.main, visitor: { code: 'SHRT01' }, companionsChildren: 0 }, '10.0.0.3');
    expect(res.statusCode).toBe(200);
    expect(PublicCheckinResponseSchema.parse(res.json()).code).toBe('CCB-SHRT01');
  });

  it('visitante por EMAIL', async () => {
    const res = await post({ activityId: A.main, visitor: { email: 'mail@a.do' }, companionsChildren: 0 }, '10.0.0.4');
    expect(res.statusCode).toBe(200);
    expect(PublicCheckinResponseSchema.parse(res.json()).code).toBe('CCB-MAIL01');
  });

  it('DUPLICADO → reserva → ON CONFLICT → rollback (409 + capacidad intacta)', async () => {
    const ok = await post({ activityId: A.dup, visitor: { code: 'CCB-DUP001' }, companionsChildren: 0 }, '10.0.0.5');
    expect(ok.statusCode).toBe(200);
    expect(await enrolled(A.dup)).toBe(1);
    // 2do check-in del mismo (org,user,activity): la tx RESERVA cupo (+1) y luego
    // el INSERT choca con el unique → throw → ROLLBACK. Que enrolled siga en 1
    // prueba que la reserva se deshizo (sin fast-path; el ON CONFLICT es el árbitro).
    const dupRes = await post({ activityId: A.dup, visitor: { code: 'CCB-DUP001' }, companionsChildren: 0 }, '10.0.0.5');
    expect(dupRes.statusCode).toBe(409);
    expect(await enrolled(A.dup)).toBe(1);
  });

  it('CUPO LLENO → 409 y capacidad intacta', async () => {
    const res = await post({ activityId: A.full, visitor: { code: 'CCB-FULL01' }, companionsChildren: 0 }, '10.0.0.6');
    expect(res.statusCode).toBe(409);
    expect(await enrolled(A.full)).toBe(3);
  });

  it('companionsChildren=2 → partySize 3 descuenta 3 cupos', async () => {
    const res = await post({ activityId: A.party, visitor: { new: { firstName: 'Bob', lastName: 'Z' } }, companionsChildren: 2 }, '10.0.0.7');
    expect(res.statusCode).toBe(200);
    expect(PublicCheckinResponseSchema.parse(res.json()).partySize).toBe(3);
    expect(await enrolled(A.party)).toBe(3);
    const att = await db.selectFrom('attendance').select('companions_children').where('activity_id', '=', A.party).executeTakeFirstOrThrow();
    expect(att.companions_children).toBe(2);
  });

  it('CONCURRENCIA: 5 POST al último cupo → exactamente 1 gana (sin oversell)', async () => {
    const reqs = Array.from({ length: 5 }, (_, i) =>
      post({ activityId: A.race, visitor: { new: { firstName: `R${i}`, lastName: 'C' } }, companionsChildren: 0 }, '10.0.0.8'));
    const results = await Promise.all(reqs);
    const ok = results.filter((r) => r.statusCode === 200).length;
    const full = results.filter((r) => r.statusCode === 409).length;
    expect(ok).toBe(1);
    expect(full).toBe(4);
    expect(await enrolled(A.race)).toBe(1); // capacidad = 1, nunca se pasa
  });

  it('aislamiento tenant: actividad de orgB en host A → 404', async () => {
    const res = await post({ activityId: actB, visitor: { new: { firstName: 'Z', lastName: 'Z' } }, companionsChildren: 0 }, '10.0.0.9');
    expect(res.statusCode).toBe(404);
  });

  it('aislamiento tenant: código de orgB en host A → 404', async () => {
    const res = await post({ activityId: A.main, visitor: { code: 'MEM-B00001' }, companionsChildren: 0 }, '10.0.0.10');
    expect(res.statusCode).toBe(404);
  });
});
