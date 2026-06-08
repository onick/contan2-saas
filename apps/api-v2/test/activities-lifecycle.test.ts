// apps/api-v2/test/activities-lifecycle.test.ts · integration (skip sin DATABASE_URL).
// PATCH /api/v2/activities/:id (edición) + PATCH /:id/status (transiciones).
// Cubre: edición válida/parcial; capacity<enrolled_count→409 (no 400); guarda de
// carrera (WHERE enrolled_count<=capacity); endDate<date→400; activa con fecha
// pasada→400 (terminales conservan fecha); campos prohibidos (organizationId/
// enrolledCount/imageUrl/status) rechazados por .strict()→400; todas las
// transiciones permitidas; idempotencia (mismo estado, sin bump); transición no
// permitida→409; reactivación con fecha pasada; 401/operator 403/cross-tenant 404;
// updated_at cambia; organization_id/enrolled_count/image_url intactos; NO DELETE.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { ActivityCreateResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const past = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

run('PATCH /activities/:id (+/status) · ciclo de vida', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `actl-a-${stamp}`;
  const slugB = `actl-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = {
    owner: `actl-owner-${stamp}`,
    admin: `actl-admin-${stamp}`,
    operator: `actl-oper-${stamp}`,
    b: `actl-b-${stamp}`,
  };

  const mkOrg = async (slug: string, codePrefix?: string) => {
    const o = await db.insertInto('organizations').values({
      slug, name: `Org ${slug}`, status: 'active', ...(codePrefix ? { code_prefix: codePrefix } : {}),
    }).returning('id').executeTakeFirstOrThrow();
    return o.id;
  };
  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId,
      email: `${role}-${orgId.slice(0, 8)}-${stamp}@test.local`,
      password_hash: 'x', full_name: `Staff ${role}`, status: 'active', role,
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      remember_me: false,
    }).execute();
  };

  // Siembra una actividad directa en DB (estados/fechas/capacidad arbitrarios para
  // los escenarios que el create no permitiría, p. ej. fecha pasada o finalizada).
  interface SeedOpts {
    org?: string;
    status?: 'activa' | 'finalizada' | 'cancelada';
    date?: string;
    endDate?: string | null;
    capacity?: number;
    enrolled?: number;
    imageUrl?: string | null;
  }
  const seed = async (o: SeedOpts = {}) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id,
      organization_id: o.org ?? orgAId,
      name: 'Actividad base', type: 'concierto', location: 'Sala 1',
      date: o.date ?? future(7),
      end_date: o.endDate ?? null,
      capacity: o.capacity ?? 100,
      enrolled_count: o.enrolled ?? 0,
      status: o.status ?? 'activa',
      description: 'desc', image_url: o.imageUrl ?? null, category: null,
    }).execute();
    return id;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA, 'CCB');
    orgBId = await mkOrg(slugB, 'MEM');
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const patch = (id: string, body: unknown, host: string, token?: string) =>
    app.inject({
      method: 'PATCH', url: `/api/v2/activities/${id}`,
      headers: { host, 'content-type': 'application/json' },
      payload: body as object,
      ...(token ? { cookies: { contan2_session: token } } : {}),
    });
  const patchStatus = (id: string, body: unknown, host: string, token?: string) =>
    app.inject({
      method: 'PATCH', url: `/api/v2/activities/${id}/status`,
      headers: { host, 'content-type': 'application/json' },
      payload: body as object,
      ...(token ? { cookies: { contan2_session: token } } : {}),
    });

  // ---- Edición ------------------------------------------------------------

  it('edición válida completa → 200, campos actualizados, updated_at bumpeado', async () => {
    const id = await seed({ capacity: 100, enrolled: 0 });
    const before = await db.selectFrom('activities').select('updated_at').where('id', '=', id).executeTakeFirstOrThrow();
    await new Promise((r) => setTimeout(r, 10));
    const newDate = future(10);
    const newEnd = future(11);
    const res = await patch(id, {
      name: 'Concierto editado', type: 'teatro', location: 'Sala 7',
      date: newDate, endDate: newEnd, capacity: 250,
      description: '  nueva desc  ', category: 'Música  Viva',
    }, hostA, TOK.admin);
    expect(res.statusCode).toBe(200);
    const { activity } = ActivityCreateResponseSchema.parse(res.json());
    expect(activity.name).toBe('Concierto editado');
    expect(activity.type).toBe('teatro');
    expect(activity.location).toBe('Sala 7');
    expect(activity.capacity).toBe(250);
    expect(activity.description).toBe('nueva desc'); // trim
    expect(activity.category).toBe('música viva'); // normalizado
    expect(activity.date).toBe(new Date(newDate).toISOString());
    expect(activity.endDate).toBe(new Date(newEnd).toISOString());

    const after = await db.selectFrom('activities').select('updated_at').where('id', '=', id).executeTakeFirstOrThrow();
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime());
  });

  it('edición parcial → sólo toca el campo enviado; el resto intacto', async () => {
    const id = await seed({ capacity: 100, enrolled: 0 });
    const res = await patch(id, { name: 'Sólo el nombre' }, hostA, TOK.admin);
    expect(res.statusCode).toBe(200);
    const { activity } = ActivityCreateResponseSchema.parse(res.json());
    expect(activity.name).toBe('Sólo el nombre');
    expect(activity.location).toBe('Sala 1'); // sin cambios
    expect(activity.capacity).toBe(100);
  });

  it('endDate null limpia la fecha de cierre', async () => {
    const id = await seed({ endDate: future(8) });
    const res = await patch(id, { endDate: null }, hostA, TOK.admin);
    expect(res.statusCode).toBe(200);
    expect(ActivityCreateResponseSchema.parse(res.json()).activity.endDate).toBe(null);
  });

  it('owner también puede editar → 200', async () => {
    const id = await seed();
    expect((await patch(id, { name: 'Editado por owner' }, hostA, TOK.owner)).statusCode).toBe(200);
  });

  // ---- Validaciones cruzadas ---------------------------------------------

  it('capacity < enrolled_count → 409 (no 400)', async () => {
    const id = await seed({ capacity: 100, enrolled: 30 });
    const res = await patch(id, { capacity: 20 }, hostA, TOK.admin);
    expect(res.statusCode).toBe(409);
  });

  it('capacity == enrolled_count → permitido (200)', async () => {
    const id = await seed({ capacity: 100, enrolled: 30 });
    expect((await patch(id, { capacity: 30 }, hostA, TOK.admin)).statusCode).toBe(200);
  });

  it('guarda de carrera: capacity baja AND enrolled sube entre check y UPDATE → 409', async () => {
    // Simula la carrera: validación pasa (capacity 50 >= enrolled 40), pero antes
    // del UPDATE el check-in sube enrolled a 60. El WHERE enrolled_count<=capacity
    // hace que el UPDATE no afecte filas → 409 (la fila existe, perdió la carrera).
    const id = await seed({ capacity: 100, enrolled: 40 });
    // El pre-check validó contra enrolled=40; antes del UPDATE el check-in sube a
    // 60. La guarda SQL (WHERE enrolled_count<=capacity) hace que el UPDATE no
    // afecte filas → 409, sin romper la fila ni el enrolled_count.
    await db.updateTable('activities').set({ enrolled_count: 60 }).where('id', '=', id).execute();
    const res = await patch(id, { capacity: 50 }, hostA, TOK.admin);
    expect(res.statusCode).toBe(409);
    // enrolled_count intacto tras el 409.
    const row = await db.selectFrom('activities').select('enrolled_count').where('id', '=', id).executeTakeFirstOrThrow();
    expect(row.enrolled_count).toBe(60);
  });

  it('endDate < date → 400', async () => {
    const id = await seed();
    expect((await patch(id, { date: future(9), endDate: future(8) }, hostA, TOK.admin)).statusCode).toBe(400);
  });

  it('actividad ACTIVA editada con fecha pasada → 400', async () => {
    const id = await seed({ status: 'activa', date: future(7) });
    expect((await patch(id, { date: past(2) }, hostA, TOK.admin)).statusCode).toBe(400);
  });

  it('actividad FINALIZADA puede editarse con fecha pasada → 200 (terminal conserva histórico)', async () => {
    const id = await seed({ status: 'finalizada', date: past(5), capacity: 100, enrolled: 0 });
    expect((await patch(id, { name: 'Edito finalizada', date: past(3) }, hostA, TOK.admin)).statusCode).toBe(200);
  });

  // ---- Campos prohibidos --------------------------------------------------

  it('campos prohibidos (organizationId/enrolledCount/imageUrl/status) → 400 por strict', async () => {
    const id = await seed();
    for (const bad of [{ organizationId: orgBId }, { enrolledCount: 999 }, { imageUrl: 'http://x/y.png' }, { status: 'cancelada' }]) {
      const res = await patch(id, { name: 'ok', ...bad }, hostA, TOK.admin);
      expect(res.statusCode).toBe(400);
    }
  });

  it('edición NO toca organization_id / enrolled_count / image_url', async () => {
    const id = await seed({ capacity: 100, enrolled: 25, imageUrl: 'cover.png' });
    await patch(id, { name: 'Editada', capacity: 300 }, hostA, TOK.admin);
    const row = await db.selectFrom('activities')
      .select(['organization_id', 'enrolled_count', 'image_url'])
      .where('id', '=', id).executeTakeFirstOrThrow();
    expect(row.organization_id).toBe(orgAId);
    expect(row.enrolled_count).toBe(25);
    expect(row.image_url).toBe('cover.png');
  });

  // ---- Auth / aislamiento -------------------------------------------------

  it('sin cookie → 401', async () => {
    const id = await seed();
    expect((await patch(id, { name: 'x' }, hostA)).statusCode).toBe(401);
  });

  it('operator → 403', async () => {
    const id = await seed();
    expect((await patch(id, { name: 'x' }, hostA, TOK.operator)).statusCode).toBe(403);
  });

  it('cross-tenant: actividad de orgB sobre host A → 404', async () => {
    const idB = await seed({ org: orgBId });
    expect((await patch(idB, { name: 'Nombre válido' }, hostA, TOK.admin)).statusCode).toBe(404);
  });

  it('inexistente → 404', async () => {
    expect((await patch(randomUUID(), { name: 'Nombre válido' }, hostA, TOK.admin)).statusCode).toBe(404);
  });

  // ---- Transiciones de estado --------------------------------------------

  it('activa → finalizada → 200', async () => {
    const id = await seed({ status: 'activa' });
    const res = await patchStatus(id, { status: 'finalizada' }, hostA, TOK.admin);
    expect(res.statusCode).toBe(200);
    expect(ActivityCreateResponseSchema.parse(res.json()).activity.status).toBe('finalizada');
  });

  it('activa → cancelada → 200 (sin emails, sin hard-delete)', async () => {
    const id = await seed({ status: 'activa' });
    const res = await patchStatus(id, { status: 'cancelada' }, hostA, TOK.admin);
    expect(res.statusCode).toBe(200);
    expect(ActivityCreateResponseSchema.parse(res.json()).activity.status).toBe('cancelada');
    // La fila sigue existiendo (cancelar ≠ borrar).
    const row = await db.selectFrom('activities').select('id').where('id', '=', id).executeTakeFirst();
    expect(row).toBeTruthy();
  });

  it('finalizada → activa → 200 (reactivación)', async () => {
    const id = await seed({ status: 'finalizada' });
    expect((await patchStatus(id, { status: 'activa' }, hostA, TOK.admin)).statusCode).toBe(200);
  });

  it('cancelada → activa → 200 (reactivación, aunque la fecha haya pasado)', async () => {
    const id = await seed({ status: 'cancelada', date: past(10) });
    const res = await patchStatus(id, { status: 'activa' }, hostA, TOK.admin);
    expect(res.statusCode).toBe(200);
    expect(ActivityCreateResponseSchema.parse(res.json()).activity.status).toBe('activa');
  });

  it('mismo estado → 200 idempotente, SIN bumpear updated_at', async () => {
    const id = await seed({ status: 'activa' });
    const before = await db.selectFrom('activities').select('updated_at').where('id', '=', id).executeTakeFirstOrThrow();
    await new Promise((r) => setTimeout(r, 10));
    const res = await patchStatus(id, { status: 'activa' }, hostA, TOK.admin);
    expect(res.statusCode).toBe(200);
    const after = await db.selectFrom('activities').select('updated_at').where('id', '=', id).executeTakeFirstOrThrow();
    expect(new Date(after.updated_at).getTime()).toBe(new Date(before.updated_at).getTime());
  });

  it('transición no permitida (finalizada → cancelada) → 409', async () => {
    const id = await seed({ status: 'finalizada' });
    expect((await patchStatus(id, { status: 'cancelada' }, hostA, TOK.admin)).statusCode).toBe(409);
  });

  it('transición no permitida (cancelada → finalizada) → 409', async () => {
    const id = await seed({ status: 'cancelada' });
    expect((await patchStatus(id, { status: 'finalizada' }, hostA, TOK.admin)).statusCode).toBe(409);
  });

  it('status inválido fuera de enum → 400', async () => {
    const id = await seed();
    expect((await patchStatus(id, { status: 'pausada' }, hostA, TOK.admin)).statusCode).toBe(400);
  });

  it('status: operator → 403; sin cookie → 401; cross-tenant → 404', async () => {
    const id = await seed({ status: 'activa' });
    expect((await patchStatus(id, { status: 'finalizada' }, hostA, TOK.operator)).statusCode).toBe(403);
    expect((await patchStatus(id, { status: 'finalizada' }, hostA)).statusCode).toBe(401);
    const idB = await seed({ org: orgBId });
    expect((await patchStatus(idB, { status: 'finalizada' }, hostA, TOK.admin)).statusCode).toBe(404);
  });

  // ---- No hard-delete -----------------------------------------------------

  it('NO existe endpoint DELETE de actividades (404 de ruta)', async () => {
    const id = await seed();
    const res = await app.inject({
      method: 'DELETE', url: `/api/v2/activities/${id}`,
      headers: { host: hostA }, cookies: { contan2_session: TOK.admin },
    });
    expect(res.statusCode).toBe(404);
    // La actividad sigue ahí.
    const row = await db.selectFrom('activities').select('id').where('id', '=', id).executeTakeFirst();
    expect(row).toBeTruthy();
  });
});
