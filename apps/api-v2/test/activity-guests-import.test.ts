// apps/api-v2/test/activity-guests-import.test.ts · integration (skip sin
// DATABASE_URL). Importar lista de invitados a una actividad: preview clasifica
// (new-invite/existing-invite/already-invited/invalid; sin-email entra); commit
// crea usuarios faltantes + invitaciones SIN sobreescribir y SIN enviar correo;
// re-commit no duplica; operator 403; actividad no activa 409.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';
delete process.env.RESEND_API_KEY;

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { GuestsImportPreviewResponseSchema, GuestsImportCommitResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;
const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

run('importar lista de invitados a una actividad (PR-1)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `gi-${stamp}`;
  const host = `${slug}.contan2.com`;
  let orgId: string;
  const TOK = { owner: `gi-own-${stamp}`, op: `gi-op-${stamp}` };
  let actId: string; let finalizedId: string;
  const EXISTE = `existe.${stamp}@x.do`;
  const YAINV = `yainv.${stamp}@x.do`;
  let existeId: string;

  const mkStaff = async (token: string, role: 'owner' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${stamp}@t.local`, password_hash: 'x', full_name: role, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: future(1), remember_me: false }).execute();
  };
  const mkAct = async (status: string) => {
    const id = randomUUID();
    await db.insertInto('activities').values({ id, organization_id: orgId, name: 'Gala', type: 'otro', location: 'S', date: future(3), capacity: 500, enrolled_count: 0, status, description: '', image_url: null, category: null } as never).execute();
    return id;
  };

  let ipSeq = 0;
  const importReq = (csv: string, commit: boolean, target: string, token = TOK.owner) => {
    const boundary = '----gi' + randomUUID().replace(/-/g, '');
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="invitados.csv"\r\nContent-Type: text/csv\r\n\r\n`),
      Buffer.from(csv, 'utf8'), Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({
      method: 'POST', url: `/api/v2/activities/${target}/import-guests?commit=${commit}`,
      headers: { host, 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-forwarded-for': `10.7.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`, cookie: `contan2_session=${token}` },
      payload,
    });
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgId = (await db.insertInto('organizations').values({ slug, name: 'Guests Org', status: 'active', code_prefix: 'GI' }).returning('id').executeTakeFirstOrThrow()).id;
    await mkStaff(TOK.owner, 'owner');
    await mkStaff(TOK.op, 'operator');
    actId = await mkAct('activa');
    finalizedId = await mkAct('finalizada');
    // usuario existente (no invitado aún)
    existeId = randomUUID();
    await db.insertInto('users').values({ id: existeId, organization_id: orgId, code: 'GI-EXIST1', first_name: 'Existente', last_name: 'Original', email: EXISTE, phone: '809-OG', visit_count: 4 }).execute();
    // usuario ya invitado a la actividad
    const yaId = randomUUID();
    await db.insertInto('users').values({ id: yaId, organization_id: orgId, code: 'GI-YAINV1', first_name: 'Ya', last_name: 'Invitado', email: YAINV, phone: null, visit_count: 0 }).execute();
    await db.insertInto('invitations').values({ organization_id: orgId, activity_id: actId, user_id: yaId, token: randomUUID().replace(/-/g, ''), expires_at: future(4) }).execute();
    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('invitations').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  const CSV = [
    'Nombre,Apellido,Email,Telefono',
    `Existente,VERSION-NUEVA,${EXISTE},809-X`,   // existe → existing-invite (no se toca)
    `Nuevo,ConMail,nuevo.${stamp}@x.do,809-1`,    // new-invite
    'SinMail,Invitado,,809-2',                    // new-invite (sin email entra igual)
    `,FaltaNombre,malo.${stamp}@x.do,`,           // invalid
    `Ya,Invitado,${YAINV},`,                      // already-invited
  ].join('\n');

  it('operator 403; actividad no activa 409', async () => {
    expect((await importReq(CSV, false, actId, TOK.op)).statusCode).toBe(403);
    expect((await importReq(CSV, false, finalizedId)).statusCode).toBe(409);
  });

  it('preview clasifica para la actividad; sin email entra; sin escrituras', async () => {
    const before = await db.selectFrom('invitations').select(db.fn.countAll<string>().as('n')).where('activity_id', '=', actId).executeTakeFirstOrThrow();
    const res = await importReq(CSV, false, actId);
    expect(res.statusCode).toBe(200);
    const body = GuestsImportPreviewResponseSchema.parse(res.json());
    expect(body.summary).toMatchObject({ total: 5, toInvite: 3, newUsers: 2, existing: 1, alreadyInvited: 1, invalid: 1, noEmail: 1 });
    const st = (s: string) => body.rows.filter((r) => r.status === s).length;
    expect(st('new-invite')).toBe(2);
    expect(st('existing-invite')).toBe(1);
    expect(st('already-invited')).toBe(1);
    expect(st('invalid')).toBe(1);
    // SIN escrituras en preview.
    const after = await db.selectFrom('invitations').select(db.fn.countAll<string>().as('n')).where('activity_id', '=', actId).executeTakeFirstOrThrow();
    expect(after.n).toBe(before.n);
  });

  it('commit crea usuarios faltantes + invitaciones; NO sobreescribe; NO envía correo', async () => {
    const res = await importReq(CSV, true, actId);
    expect(res.statusCode).toBe(201);
    const body = GuestsImportCommitResponseSchema.parse(res.json());
    expect(body.result).toMatchObject({ invited: 3, createdUsers: 2, alreadyInvited: 1, failed: 0 });

    // INVARIANTE: "Existente Original" intacto (no lo pisó VERSION-NUEVA), y AHORA invitado.
    const ex = await db.selectFrom('users').select(['first_name', 'last_name', 'phone', 'visit_count']).where('id', '=', existeId).executeTakeFirstOrThrow();
    expect(ex).toMatchObject({ first_name: 'Existente', last_name: 'Original', phone: '809-OG', visit_count: 4 });
    const exInv = await db.selectFrom('invitations').select(['status', 'sent_at']).where('activity_id', '=', actId).where('user_id', '=', existeId).executeTakeFirstOrThrow();
    expect(exInv.status).toBe('pending');
    expect(exInv.sent_at).toBeNull(); // no se envió correo

    // Los 2 nuevos creados con código GI- y con invitación.
    const nuevo = await db.selectFrom('users').select(['id', 'code']).where('organization_id', '=', orgId).where('email', '=', `nuevo.${stamp}@x.do`).executeTakeFirstOrThrow();
    expect(nuevo.code).toMatch(/^GI-/);
    const nuevoInv = await db.selectFrom('invitations').select('id').where('activity_id', '=', actId).where('user_id', '=', nuevo.id).executeTakeFirst();
    expect(nuevoInv).toBeTruthy();
    // total invitaciones de la actividad = 1 (yaInv) + 3 (existente, nuevo, sinmail) = 4
    const total = await db.selectFrom('invitations').select(db.fn.countAll<string>().as('n')).where('activity_id', '=', actId).executeTakeFirstOrThrow();
    expect(Number(total.n)).toBe(4);
  });

  it('re-commit: los con email ya en la lista (no se duplican); el SIN email no es dedupable → se re-invita', async () => {
    const res = await importReq(CSV, true, actId);
    const body = GuestsImportCommitResponseSchema.parse(res.json());
    // Existente, Nuevo y Ya → already-invited (no se duplican). SinMail (sin
    // email) NO es dedupable → otro usuario + su invitación.
    expect(body.result.alreadyInvited).toBe(3);
    expect(body.result.invited).toBe(1);
    expect(body.result.createdUsers).toBe(1);
    const total = await db.selectFrom('invitations').select(db.fn.countAll<string>().as('n')).where('activity_id', '=', actId).executeTakeFirstOrThrow();
    expect(Number(total.n)).toBe(5); // 4 previas + 1 del SinMail re-creado
  });
});
