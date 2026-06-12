// apps/api-v2/test/protocol.test.ts · integration (skip sin DATABASE_URL).
// Módulo Protocolo PR-2: designar (upsert/reactiva) → directorio con counts →
// candidatos por actividad (exclusiones) → invitar lote con plus_ones →
// RSVP público reserva 1+N cupos (insuficiente → 409) → desactivar. RBAC:
// operator 403 en todo.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';
delete process.env.RESEND_API_KEY;

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { ProtocolListResponseSchema, ActivityInvitationsResponseSchema, RsvpPreviewResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;
const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

run('Protocolo · designar e invitar con acompañantes', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `proto-${stamp}`;
  const host = `${slug}.contan2.com`;
  let orgId: string;
  const TOK = { admin: `proto-adm-${stamp}`, operator: `proto-op-${stamp}` };

  let act: string; // cap 4 → embajador +2 confirma (3) y al diplomático +2 no le cabe
  let uEmb: string; let uDip: string; let uSinEmail: string;

  const mkUser = async (email: string | null) => {
    const id = randomUUID();
    await db.insertInto('users').values({
      id, organization_id: orgId, code: `CCB-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      first_name: 'P', last_name: `U${id.slice(0, 4)}`, email, phone: null, visit_count: 0,
    } as never).execute();
    return id;
  };

  let ipSeq = 0;
  const call = (method: string, url: string, body?: unknown, token?: string) =>
    app.inject({
      method: method as 'GET', url,
      headers: {
        host, 'x-forwarded-for': `10.3.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { cookie: `contan2_session=${token}` } : {}),
      },
      ...(body !== undefined ? { payload: body as object } : {}),
    });

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgId = (await db.insertInto('organizations').values({ slug, name: 'Proto Org', status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
    for (const [tok, role] of [[TOK.admin, 'admin'], [TOK.operator, 'operator']] as const) {
      const st = await db.insertInto('staff_members').values({
        organization_id: orgId, email: `${role}-p-${stamp}@t.local`, password_hash: 'x',
        full_name: 'S', status: 'active', role,
      }).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({
        staff_member_id: st.id, token_hash: hashToken(tok), expires_at: future(1), remember_me: false,
      }).execute();
    }
    uEmb = await mkUser(`emb-${stamp}@t.local`);
    uDip = await mkUser(`dip-${stamp}@t.local`);
    uSinEmail = await mkUser(null);
    act = randomUUID();
    await db.insertInto('activities').values({
      id: act, organization_id: orgId, name: 'Gala', type: 'otro', location: 'S',
      date: future(3), capacity: 4, enrolled_count: 0, status: 'activa',
      description: '', image_url: null, category: null,
    } as never).execute();
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('invitations').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('protocol_profiles').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
      db.selectFrom('staff_members').select('id').where('organization_id', '=', orgId)).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('designar (admin) → directorio con counts; operator → 403; upsert reactiva', async () => {
    expect((await call('POST', '/api/v2/protocol', { userId: uEmb, category: 'diplomatico', honorific: 'Sr. Embajador' }, TOK.operator)).statusCode).toBe(403);

    expect((await call('POST', '/api/v2/protocol', { userId: uEmb, category: 'diplomatico', honorific: 'Sr. Embajador', orgTitle: 'Embajada de España' }, TOK.admin)).statusCode).toBe(201);
    expect((await call('POST', '/api/v2/protocol', { userId: uDip, category: 'autoridad' }, TOK.admin)).statusCode).toBe(201);
    expect((await call('POST', '/api/v2/protocol', { userId: uSinEmail, category: 'prensa' }, TOK.admin)).statusCode).toBe(201);

    const list = ProtocolListResponseSchema.parse((await call('GET', '/api/v2/protocol', undefined, TOK.admin)).json());
    expect(list.profiles).toHaveLength(3);
    expect(list.counts).toMatchObject({ diplomatico: 1, autoridad: 1, prensa: 1 });
    const emb = list.profiles.find((p) => p.userId === uEmb)!;
    expect(emb.honorific).toBe('Sr. Embajador');
    expect(emb.orgTitle).toBe('Embajada de España');

    // filtro por categoría
    const dips = ProtocolListResponseSchema.parse((await call('GET', '/api/v2/protocol?category=diplomatico', undefined, TOK.admin)).json());
    expect(dips.profiles).toHaveLength(1);

    // upsert: re-designar cambia categoría sin duplicar
    expect((await call('POST', '/api/v2/protocol', { userId: uDip, category: 'directivo' }, TOK.admin)).statusCode).toBe(201);
    const after = ProtocolListResponseSchema.parse((await call('GET', '/api/v2/protocol', undefined, TOK.admin)).json());
    expect(after.profiles).toHaveLength(3);
    expect(after.profiles.find((p) => p.userId === uDip)!.category).toBe('directivo');
  });

  it('candidatos: solo designados activos; excluye sin-email', async () => {
    const res = await call('GET', `/api/v2/activities/${act}/protocol-candidates`, undefined, TOK.admin);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { candidates: Array<{ userId: string; honorific: string | null }>; excluded: { noEmail: number } };
    expect(body.candidates.map((c) => c.userId).sort()).toEqual([uEmb, uDip].sort());
    expect(body.excluded.noEmail).toBe(1);
  });

  it('invitar lote con plus_ones → kind protocol; RSVP sí reserva 1+N; cupo insuficiente → 409', async () => {
    const r = await call('POST', `/api/v2/activities/${act}/protocol-invitations`,
      { invites: [{ userId: uEmb, plusOnes: 2 }, { userId: uDip, plusOnes: 2 }] }, TOK.admin);
    expect(r.statusCode).toBe(201);
    expect(r.json().summary).toMatchObject({ created: 2, reused: 0, skipped: 0, dryRun: true });

    const list = ActivityInvitationsResponseSchema.parse((await call('GET', `/api/v2/activities/${act}/invitations`, undefined, TOK.admin)).json());
    expect(list.invitations.every((i) => i.kind === 'protocol' && i.plusOnes === 2)).toBe(true);

    const tokens = await db.selectFrom('invitations').select(['token', 'user_id'])
      .where('activity_id', '=', act).execute();
    const tEmb = tokens.find((t) => t.user_id === uEmb)!.token;
    const tDip = tokens.find((t) => t.user_id === uDip)!.token;

    // preview lleva plusOnes
    const prev = RsvpPreviewResponseSchema.parse((await call('GET', `/api/v2/public/rsvp/${tEmb}`)).json());
    expect(prev.invitation.plusOnes).toBe(2);

    // sí del embajador → 1+2 = 3 de 4
    const yes = await call('POST', `/api/v2/public/rsvp/${tEmb}`, { action: 'yes' });
    expect(yes.statusCode).toBe(200);
    const a1 = await db.selectFrom('activities').select('enrolled_count').where('id', '=', act).executeTakeFirstOrThrow();
    expect(a1.enrolled_count).toBe(3);

    // sí del diplomático necesita 3 y queda 1 → 409, invitación sigue pending
    const full = await call('POST', `/api/v2/public/rsvp/${tDip}`, { action: 'yes' });
    expect(full.statusCode).toBe(409);
    const inv2 = await db.selectFrom('invitations').select('status').where('token', '=', tDip).executeTakeFirstOrThrow();
    expect(inv2.status).toBe('pending');
  });

  it('desactivar saca del directorio y de candidatos; 404 al repetir', async () => {
    expect((await call('DELETE', `/api/v2/protocol/${uSinEmail}`, undefined, TOK.admin)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/v2/protocol/${uSinEmail}`, undefined, TOK.admin)).statusCode).toBe(404);
    const list = ProtocolListResponseSchema.parse((await call('GET', '/api/v2/protocol', undefined, TOK.admin)).json());
    expect(list.profiles.map((p) => p.userId)).not.toContain(uSinEmail);
    // con ?all=1 sigue visible (historial)
    const all = ProtocolListResponseSchema.parse((await call('GET', '/api/v2/protocol?all=1', undefined, TOK.admin)).json());
    expect(all.profiles.map((p) => p.userId)).toContain(uSinEmail);
  });
});
