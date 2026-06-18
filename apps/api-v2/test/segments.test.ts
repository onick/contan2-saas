// apps/api-v2/test/segments.test.ts · integration (skip sin DATABASE_URL).
// GET /segments + /segments/:id — paridad v1 (afinidad desde attendance):
//   vip (≥10) / newcomers (=1) / active (<30d) / dormant (≥90d) / con-sin correo
//   / fans por tipo (cine·taller ≥2, resto ≥3) / fans-cat-<slug> dinámicos.
//   Miembros ordenados por asistencias; archivados fuera; cross-tenant aislado.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { SegmentsResponseSchema, SegmentMembersResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';
import { slugifyCategory, groupCategoriesBySlug } from '../src/routes/segments.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

// Unit (sin DB): dedup de categorías por acento/mayúsculas.
describe('groupCategoriesBySlug · dedup por acento/mayúsculas', () => {
  it('"Cine Clásico" y "Cine Clasico" se fusionan en un segmento, usuarios distintos, label acentuado', () => {
    const pairs = [
      { user_id: 'u1', k: 'cine clásico', n: 3 },
      { user_id: 'u2', k: 'cine clásico', n: 1 },
      { user_id: 'u3', k: 'cine clasico', n: 1 }, // grafía sin acento
      { user_id: 'u1', k: 'cine clasico', n: 1 }, // u1 en ambas → cuenta UNA vez
      { user_id: 'u4', k: 'Tertulia', n: 2 },
    ];
    const out = groupCategoriesBySlug(pairs);
    const clasico = out.find((c) => c.slug === 'cine-clasico')!;
    expect(clasico).toBeTruthy();
    expect(clasico.userCount).toBe(3); // u1, u2, u3 (u1 una sola vez)
    expect(clasico.label).toBe('cine clásico'); // grafía más usada (4 asistencias vs 2)
    // sólo dos segmentos (cine-clasico + tertulia), no tres
    expect(out.map((c) => c.slug).sort()).toEqual(['cine-clasico', 'tertulia']);
  });

  it('ignora n<1 y categorías vacías', () => {
    expect(groupCategoriesBySlug([{ user_id: 'u1', k: '', n: 5 }])).toEqual([]);
  });
});

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

run('GET /segments (+/:id) · afinidad', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `seg-a-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { admin: `seg-admin-${stamp}` };

  const mkOrg = async (slug: string) => (await db.insertInto('organizations')
    .values({ slug, name: `Org ${slug}`, status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string) => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId, email: `seg-${orgId.slice(0, 8)}-${stamp}@test.local`,
      password_hash: 'x', full_name: 'Staff', status: 'active', role: 'admin',
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
  };
  const mkActivity = async (org: string, type: string, category: string | null = null) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id, organization_id: org, name: `Act ${id.slice(0, 6)}`, type, location: 'Sala',
      date: daysAgo(10), capacity: 100, enrolled_count: 0, status: 'finalizada',
      description: '', image_url: null, category,
    }).execute();
    return id;
  };
  const mkUser = async (org: string, over: Record<string, unknown> = {}) => {
    const id = randomUUID();
    await db.insertInto('users').values({
      id, organization_id: org, code: `CCB-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      first_name: 'V', last_name: `U${id.slice(0, 4)}`, email: null, phone: null, visit_count: 0, ...over,
    } as never).execute();
    return id;
  };
  const attend = async (org: string, activityId: string, userId: string, at: string) => {
    await db.insertInto('attendance').values({
      id: randomUUID(), organization_id: org, user_id: userId, activity_id: activityId,
      activity_name: 'x', user_code: null, anonymous: false, companions_children: 0, registered_at: at,
    } as never).execute();
  };

  const get = (url: string) => app.inject({
    method: 'GET', url, headers: { host: hostA, cookie: `contan2_session=${TOK.admin}` },
  });

  // Fixture: uVip 10 asistencias recientes (cine ×10 → fan de cine, activo, con email);
  // uNuevo 1 asistencia ayer (sin email); uDormido 2 asistencias hace 100+ días
  // (taller ×2 → fan de taller); uCiclo 1 asistencia a categoría "Ciclo Jazz 2026";
  // uArchivado con asistencias pero deleted_at → fuera de todo.
  let uVip: string, uNuevo: string, uDormido: string, uCiclo: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(`seg-b-${stamp}`);
    await mkStaff(orgAId, TOK.admin);

    uVip = await mkUser(orgAId, { email: `vip-${stamp}@test.local` });
    for (let i = 0; i < 10; i++) {
      const act = await mkActivity(orgAId, 'cine');
      await attend(orgAId, act, uVip, daysAgo(i + 1));
    }

    uNuevo = await mkUser(orgAId);
    await attend(orgAId, await mkActivity(orgAId, 'concierto'), uNuevo, daysAgo(1));

    uDormido = await mkUser(orgAId);
    await attend(orgAId, await mkActivity(orgAId, 'taller'), uDormido, daysAgo(120));
    await attend(orgAId, await mkActivity(orgAId, 'taller'), uDormido, daysAgo(100));

    uCiclo = await mkUser(orgAId);
    await attend(orgAId, await mkActivity(orgAId, 'cine', 'ciclo jazz 2026'), uCiclo, daysAgo(2));

    const uArch = await mkUser(orgAId, { deleted_at: new Date().toISOString() });
    await attend(orgAId, await mkActivity(orgAId, 'cine'), uArch, daysAgo(1));

    // Ruido de otro tenant.
    const uB = await mkUser(orgBId);
    await attend(orgBId, await mkActivity(orgBId, 'cine'), uB, daysAgo(1));

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
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  it('catálogo: conteos exactos por segmento (archivados y otros tenants fuera)', async () => {
    const res = await get('/api/v2/segments');
    expect(res.statusCode).toBe(200);
    const { segments, totalVisitors } = SegmentsResponseSchema.parse(res.json());
    const byId = Object.fromEntries(segments.map((s) => [s.id, s.count]));

    expect(totalVisitors).toBe(4); // archivado fuera
    expect(byId['vip']).toBe(1); // uVip
    expect(byId['newcomers']).toBe(2); // uNuevo y uCiclo (1 asistencia c/u)
    expect(byId['active']).toBe(3); // uVip, uNuevo, uCiclo (<30d)
    expect(byId['dormant']).toBe(1); // uDormido (≥90d)
    expect(byId['with-email']).toBe(1); // uVip
    expect(byId['without-email']).toBe(3);
    expect(byId['fans-cine']).toBe(1); // uVip (10 ≥ 2); uCiclo tiene 1 → no
    expect(byId['fans-taller']).toBe(1); // uDormido (2 ≥ 2)
    expect(byId['fans-concierto']).toBe(0); // uNuevo tiene 1 < 3
    expect(byId[`fans-cat-${slugifyCategory('ciclo jazz 2026')}`]).toBe(1); // uCiclo
  });

  it('miembros de fans-cine: uVip con su afinidad (orden por asistencias)', async () => {
    const res = await get('/api/v2/segments/fans-cine');
    expect(res.statusCode).toBe(200);
    const { segment, members, total } = SegmentMembersResponseSchema.parse(res.json());
    expect(segment.id).toBe('fans-cine');
    expect(total).toBe(1);
    expect(members[0]!.id).toBe(uVip);
    expect(members[0]!.totalAttendances).toBe(10);
    expect(members[0]!.status).toBe('activo');
    expect(members[0]!.daysSinceLastVisit).toBe(1);
  });

  it('miembros del segmento dinámico por categoría', async () => {
    const res = await get(`/api/v2/segments/fans-cat-${slugifyCategory('ciclo jazz 2026')}`);
    expect(res.statusCode).toBe(200);
    const { members } = SegmentMembersResponseSchema.parse(res.json());
    expect(members.map((m) => m.id)).toEqual([uCiclo]);
  });

  it('dormant: uDormido con status dormido; segmento inexistente → 404; sin cookie → 401', async () => {
    const res = await get('/api/v2/segments/dormant');
    const { members } = SegmentMembersResponseSchema.parse(res.json());
    expect(members.map((m) => m.id)).toEqual([uDormido]);
    expect(members[0]!.status).toBe('dormido');

    expect((await get('/api/v2/segments/no-existe')).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v2/segments', headers: { host: hostA } })).statusCode).toBe(401);
  });
});
