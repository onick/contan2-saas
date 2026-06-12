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
  const TOK = { admin: `proto-adm-${stamp}`, operator: `proto-op-${stamp}`, depto: `proto-dep-${stamp}` };

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
    for (const [tok, role] of [[TOK.admin, 'admin'], [TOK.operator, 'operator'], [TOK.depto, 'protocolo']] as const) {
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

  it('una invitación CANCELADA se puede re-invitar (token nuevo, pending)', async () => {
    // cancelar la pendiente del diplomático y re-invitarlo con otros acompañantes
    const inv = await db.selectFrom('invitations').select(['id', 'token'])
      .where('user_id', '=', uDip).where('activity_id', '=', act).executeTakeFirstOrThrow();
    expect((await call('POST', `/api/v2/activities/${act}/invitations/${inv.id}/cancel`, {}, TOK.admin)).statusCode).toBe(204);

    const r = await call('POST', `/api/v2/activities/${act}/protocol-invitations`,
      { invites: [{ userId: uDip, plusOnes: 0 }] }, TOK.admin);
    expect(r.json().summary).toMatchObject({ created: 1, reused: 0, skipped: 0 });
    const after = await db.selectFrom('invitations').select(['status', 'token', 'plus_ones'])
      .where('id', '=', inv.id).executeTakeFirstOrThrow();
    expect(after.status).toBe('pending');
    expect(after.token).not.toBe(inv.token); // token fresco
    expect(after.plus_ones).toBe(0);
  });

  it('banner de puerta: búsqueda marca protocolo; check-in admin y público llevan el badge con plusOnes', async () => {
    // El embajador confirmó (+2) en el test anterior → su attendance existe (sin
    // check-in). La BÚSQUEDA lo marca como protocolo:
    const search = await call('GET', `/api/v2/checkin/visitors?q=${encodeURIComponent('U' )}`, undefined, TOK.admin);
    // (la búsqueda multi-campo puede traer varios; localizamos al embajador)
    const embRow = (search.json() as { items: Array<{ id: string; protocol: { honorific: string | null } | null }> })
      .items.find((i) => i.id === uEmb);
    if (embRow) expect(embRow.protocol?.honorific).toBe('Sr. Embajador');

    // Check-in ADMIN del embajador → protocol badge con plusOnes=2.
    const embCode = (await db.selectFrom('users').select('code').where('id', '=', uEmb).executeTakeFirstOrThrow()).code;
    const adm = await call('POST', '/api/v2/checkin', { activityId: act, visitor: { code: embCode }, companionsChildren: 0 }, TOK.admin);
    expect(adm.statusCode).toBe(201);
    expect(adm.json().protocol).toMatchObject({ category: 'diplomatico', honorific: 'Sr. Embajador', plusOnes: 2 });
    // LLEGADA de la reserva RSVP: marca presente SIN volver a reservar cupo
    // (seguía en 3 por el sí del embajador +2) y sin 409.
    const att = await db.selectFrom('attendance').select('checked_in_at')
      .where('activity_id', '=', act).where('user_id', '=', uEmb).executeTakeFirstOrThrow();
    expect(att.checked_in_at).not.toBeNull();
    const enr = await db.selectFrom('activities').select('enrolled_count').where('id', '=', act).executeTakeFirstOrThrow();
    expect(enr.enrolled_count).toBe(3);
    // Re-escanear al ya presente → ahora sí 409 (duplicado real).
    expect((await call('POST', '/api/v2/checkin', { activityId: act, visitor: { code: embCode }, companionsChildren: 0 }, TOK.admin)).statusCode).toBe(409);

    // Check-in PÚBLICO (scanner/kiosko) de un designado SIN invitación a esa
    // actividad → badge presente con plusOnes 0. (uDip quedó re-invitado
    // pending; usamos su badge igualmente — cupo: cap 4, ocupados 3+, el
    // público suma 1 → al límite exacto.)
    const dipCode = (await db.selectFrom('users').select('code').where('id', '=', uDip).executeTakeFirstOrThrow()).code;
    const pub = await call('POST', '/api/v2/public/checkin', { activityId: act, visitor: { code: dipCode }, companionsChildren: 0 });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().protocol).toMatchObject({ category: 'directivo', plusOnes: 0 });
  });

  it('reporte de actividad: hoja Protocolo con invitados, estado y asistencia', async () => {
    const res = await call('GET', `/api/v2/reports/activity/${act}.xlsx`, undefined, TOK.admin);
    expect(res.statusCode).toBe(200);
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    const sheet = wb.worksheets.find((w) => w.name === 'Protocolo');
    expect(sheet).toBeTruthy();
    const textos: string[] = [];
    sheet!.eachRow((row) => { textos.push(JSON.stringify(row.values)); });
    const todo = textos.join(' ');
    expect(todo).toContain('Sr. Embajador');
    expect(todo).toContain('Diplomático');
    expect(todo).toContain('+2');
    expect(todo).toContain('Sí'); // el embajador llegó (check-in del test anterior)
  });

  it("rol 'protocolo' (PR-7): usa su módulo (directorio + invitar) pero 403 fuera (historial)", async () => {
    // su módulo: directorio OK
    expect((await call('GET', '/api/v2/protocol', undefined, TOK.depto)).statusCode).toBe(200);
    // designar también (gestiona el directorio del departamento)
    const u6 = await mkUser(`f6-${stamp}@t.local`);
    expect((await call('POST', '/api/v2/protocol', { userId: u6, category: 'prensa' }, TOK.depto)).statusCode).toBe(201);
    // invitar a la actividad
    const r = await call('POST', `/api/v2/activities/${act}/protocol-invitations`,
      { invites: [{ userId: u6, plusOnes: 1 }] }, TOK.depto);
    expect(r.statusCode).toBe(201);
    expect(r.json().summary.created).toBe(1);
    // fuera de su módulo: el historial (owner/admin) lo rechaza
    expect((await call('GET', '/api/v2/org/audit', undefined, TOK.depto)).statusCode).toBe(403);
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
