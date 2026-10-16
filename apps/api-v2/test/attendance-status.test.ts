// apps/api-v2/test/attendance-status.test.ts · integration (skip sin DATABASE_URL).
// GET /attendance?status=all|checked_in|reserved — reservas (checked_in_at NULL)
// vs check-ins reales; conteos checkedIn/reserved independientes de `status`;
// fecha efectiva = coalesce(checked_in_at, registered_at) para dateFrom/dateTo y orden.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { AttendanceListResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const DAY = 86_400_000;

run('GET /attendance · status reservas vs check-ins', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `attst-${stamp}`;
  const host = `${slug}.contan2.com`;
  let orgId: string;
  let act: string;
  const TOKEN = `attst-adm-${stamp}`;
  const ids: Record<string, string> = {};

  const mkAtt = async (
    key: string, opts: { checkedInAt: string | null; registeredAt: string; kids?: number; adults?: number },
  ) => {
    const id = randomUUID();
    ids[key] = id;
    await db.insertInto('attendance').values({
      id, organization_id: orgId, user_id: null, activity_id: act, activity_name: 'Act status',
      user_code: null, anonymous: true,
      companions_children: opts.kids ?? 0, companions_adults: opts.adults ?? 0,
      checked_in_at: opts.checkedInAt, registered_at: opts.registeredAt,
    } as never).execute();
  };
  const list = async (qs = '') => {
    const res = await app.inject({
      method: 'GET', url: `/api/v2/attendance?activityId=${act}${qs}`,
      headers: { host, cookie: `contan2_session=${TOKEN}` },
    });
    return { res, body: res.statusCode === 200 ? AttendanceListResponseSchema.parse(res.json()) : res.json() };
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgId = (await db.insertInto('organizations').values({ slug, name: 'AttSt', status: 'active' })
      .returning('id').executeTakeFirstOrThrow()).id;
    const st = await db.insertInto('staff_members').values({
      organization_id: orgId, email: `adm-${stamp}@t.local`, password_hash: 'x',
      full_name: 'S', status: 'active', role: 'admin',
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: st.id, token_hash: hashToken(TOKEN),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
    act = randomUUID();
    await db.insertInto('activities').values({
      id: act, organization_id: orgId, name: 'Act status', type: 'cine', location: 'S',
      date: new Date(Date.now() + DAY).toISOString(), capacity: 50, enrolled_count: 0,
      status: 'activa', description: '', image_url: null, category: null,
    }).execute();
    // 2 check-ins (uno con +1 adulto), 3 holds (uno con +2).
    await mkAtt('ci1', { checkedInAt: ago(60_000), registeredAt: ago(60_000) });
    await mkAtt('ci2', { checkedInAt: ago(120_000), registeredAt: ago(120_000), adults: 1 });
    await mkAtt('h1', { checkedInAt: null, registeredAt: ago(10 * DAY) });
    await mkAtt('h2', { checkedInAt: null, registeredAt: ago(9 * DAY) });
    await mkAtt('h3', { checkedInAt: null, registeredAt: ago(8 * DAY), kids: 1, adults: 1 });
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (orgId) {
      await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    }
    await db.destroy();
  });

  it('sin status (= all) devuelve todo y los conteos de desglose', async () => {
    const { res, body } = await list();
    expect(res.statusCode).toBe(200);
    expect(body.total).toBe(5);
    expect(body.people).toBe(8); // 5 filas + 1 adulto + 2 de h3
    expect(body.checkedIn).toBe(2);
    expect(body.reserved).toBe(3);
    expect(body.checkedInPeople).toBe(3);
    expect(body.reservedPeople).toBe(5);
  });

  it('status=checked_in solo check-ins; los conteos no dependen de status', async () => {
    const { body } = await list('&status=checked_in');
    expect(body.items.map((i) => i.id).sort()).toEqual([ids.ci1, ids.ci2].sort());
    expect(body.total).toBe(2);
    expect(body.people).toBe(3);
    expect(body.checkedIn).toBe(2);
    expect(body.reserved).toBe(3);
    expect(body.reservedPeople).toBe(5);
  });

  it('status=reserved solo reservas', async () => {
    const { body } = await list('&status=reserved');
    expect(body.items.map((i) => i.id).sort()).toEqual([ids.h1, ids.h2, ids.h3].sort());
    expect(body.total).toBe(3);
    expect(body.people).toBe(5);
    expect(body.checkedIn).toBe(2);
    expect(body.reserved).toBe(3);
    expect(body.items.every((i) => i.checkedInAt === null)).toBe(true);
  });

  it('status inválido → 400', async () => {
    const { res } = await list('&status=bogus');
    expect(res.statusCode).toBe(400);
  });

  it('orden y fechas por coalesce(checked_in_at, registered_at)', async () => {
    // Hold invitado hace 3 días que llegó HOY: debe aparecer primero y caer en dateFrom=hoy.
    await mkAtt('conv', { checkedInAt: ago(1_000), registeredAt: ago(3 * DAY) });
    const all = await list();
    expect(all.body.items[0].id).toBe(ids.conv);

    const from = encodeURIComponent(ago(DAY));
    const today = await list(`&dateFrom=${from}`);
    const got = today.body.items.map((i) => i.id);
    expect(got).toContain(ids.conv); // por checked_in_at, aunque registered_at sea viejo
    expect(got).toContain(ids.ci1);
    expect(got).not.toContain(ids.h1); // reserva de hace 10 días: fecha efectiva = registered_at
    expect(today.body.reserved).toBe(0);
  });
});
