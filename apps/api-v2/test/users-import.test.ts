// apps/api-v2/test/users-import.test.ts · integration (skip sin DATABASE_URL).
// PR-I1: importar visitantes en lote. Preview clasifica (new/duplicate/
// duplicate-in-file/invalid + nameWarning); commit crea SÓLO las new y NUNCA
// sobreescribe al existente; no envía credencial; operator 403; xlsx + csv.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';
delete process.env.RESEND_API_KEY;

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import ExcelJS from 'exceljs';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { UsersImportPreviewResponseSchema, UsersImportCommitResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

type Part = { kind: 'file'; name: string; filename: string; ct: string; buffer: Buffer } | { kind: 'field'; name: string; value: string };
function multipartRaw(parts: Part[]) {
  const boundary = '----imp' + randomUUID().replace(/-/g, '');
  const chunks: Buffer[] = [];
  for (const p of parts) {
    if (p.kind === 'field') {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`));
    } else {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.ct}\r\n\r\n`));
      chunks.push(p.buffer); chunks.push(Buffer.from('\r\n'));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), ct: `multipart/form-data; boundary=${boundary}` };
}

run('users · importar en lote (PR-I1)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `imp-${stamp}`;
  const host = `${slug}.contan2.com`;
  let orgId: string;
  const TOK = { owner: `imp-own-${stamp}`, op: `imp-op-${stamp}` };
  const EXISTING_EMAIL = `ana.existe.${stamp}@ccb.do`;
  let anaId: string;

  const mkStaff = async (token: string, role: 'owner' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${stamp}@t.local`, password_hash: 'x', full_name: role, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };

  let ipSeq = 0;
  const importReq = (csv: string | Buffer, filename: string, ct: string, commit: boolean, token = TOK.owner) => {
    const mp = multipartRaw([{ kind: 'file', name: 'file', filename, ct, buffer: Buffer.isBuffer(csv) ? csv : Buffer.from(csv, 'utf8') }]);
    return app.inject({
      method: 'POST', url: `/api/v2/users/import?commit=${commit}`,
      headers: { host, 'content-type': mp.ct, 'x-forwarded-for': `10.6.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`, cookie: `contan2_session=${token}` },
      payload: mp.payload,
    });
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgId = (await db.insertInto('organizations').values({ slug, name: 'Import Org', status: 'active', code_prefix: 'IMP' }).returning('id').executeTakeFirstOrThrow()).id;
    await mkStaff(TOK.owner, 'owner');
    await mkStaff(TOK.op, 'operator');
    // Existente por EMAIL (para probar dup + no-sobreescribir).
    anaId = randomUUID();
    await db.insertInto('users').values({ id: anaId, organization_id: orgId, code: 'IMP-ANA001', first_name: 'Ana', last_name: 'Original', email: EXISTING_EMAIL, phone: '809-ORIG', visit_count: 7 }).execute();
    // Existente por NOMBRE (para el aviso de doble; email distinto).
    await db.insertInto('users').values({ id: randomUUID(), organization_id: orgId, code: 'IMP-BETO01', first_name: 'Beto', last_name: 'Dobles', email: `beto.viejo.${stamp}@ccb.do`, phone: null, visit_count: 1 }).execute();
    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  const CSV = [
    'Nombre,Apellido,Email,Telefono',
    `Ana,VERSION-NUEVA,${EXISTING_EMAIL},809-NUEVO`,   // duplicate (email existe) → NO debe pisar
    `Carlos,Nuevo,carlos.${stamp}@ccb.do,809-1`,        // new
    `Carlos,Otro,carlos.${stamp}@ccb.do,809-2`,         // duplicate-in-file
    `Beto,Dobles,beto.nuevo.${stamp}@ccb.do,809-3`,     // new + nameWarning
    `,SinNombre,x.${stamp}@ccb.do,`,                    // invalid (falta nombre)
    'Zoe,Zeta,correo-malo,809-4',                       // invalid (email mal)
    'SinMail,Walkin,,809-5',                            // new (sin email)
  ].join('\n');

  it('operator → 403; archivo no reconocido → 400', async () => {
    expect((await importReq(CSV, 'x.csv', 'text/csv', false, TOK.op)).statusCode).toBe(403);
    expect((await importReq('foo,bar\n1,2', 'x.csv', 'text/csv', false)).statusCode).toBe(400);
  });

  it('preview clasifica new/duplicate/duplicate-in-file/invalid + nameWarning; sin escrituras', async () => {
    const before = await db.selectFrom('users').select(db.fn.countAll<string>().as('n')).where('organization_id', '=', orgId).executeTakeFirstOrThrow();
    const res = await importReq(CSV, 'visitantes.csv', 'text/csv', false);
    expect(res.statusCode).toBe(200);
    const body = UsersImportPreviewResponseSchema.parse(res.json());
    expect(body.mode).toBe('preview');
    expect(body.summary).toMatchObject({ total: 7, new: 3, duplicates: 2, invalid: 2, nameWarnings: 1 });
    const byStatus = (s: string) => body.rows.filter((r) => r.status === s).length;
    expect(byStatus('new')).toBe(3);
    expect(byStatus('duplicate')).toBe(1);
    expect(byStatus('duplicate-in-file')).toBe(1);
    expect(byStatus('invalid')).toBe(2);
    expect(body.rows.find((r) => r.nameWarning)?.firstName).toBe('Beto');
    // SIN escrituras en preview.
    const after = await db.selectFrom('users').select(db.fn.countAll<string>().as('n')).where('organization_id', '=', orgId).executeTakeFirstOrThrow();
    expect(after.n).toBe(before.n);
  });

  it('commit crea SÓLO las new; NUNCA sobreescribe al existente; sin credencial', async () => {
    const res = await importReq(CSV, 'visitantes.csv', 'text/csv', true);
    expect(res.statusCode).toBe(201);
    const body = UsersImportCommitResponseSchema.parse(res.json());
    expect(body.result).toMatchObject({ created: 3, skipped: 0, failed: 0 });

    // INVARIANTE: Ana Original quedó INTACTA (no la pisó la fila 'VERSION-NUEVA').
    const ana = await db.selectFrom('users').select(['first_name', 'last_name', 'phone', 'visit_count']).where('id', '=', anaId).executeTakeFirstOrThrow();
    expect(ana).toMatchObject({ first_name: 'Ana', last_name: 'Original', phone: '809-ORIG', visit_count: 7 });

    // Los 3 nuevos existen, con código del prefijo IMP, SIN credencial enviada.
    const carlos = await db.selectFrom('users').select(['code', 'credential_sent_at', 'visit_count']).where('organization_id', '=', orgId).where('email', '=', `carlos.${stamp}@ccb.do`).executeTakeFirstOrThrow();
    expect(carlos.code).toMatch(/^IMP-/);
    expect(carlos.credential_sent_at).toBeNull();
    expect(carlos.visit_count).toBe(0);
    // Audit de import.
    const audit = await db.selectFrom('tenant_audit_log').select('metadata').where('organization_id', '=', orgId).where('action', '=', 'users.imported').executeTakeFirst();
    expect(audit).toBeTruthy();
  });

  it('re-commit: los que TIENEN email ya no se recrean; el SIN email no es dedupable (queda new + aviso de nombre)', async () => {
    const res = await importReq(CSV, 'visitantes.csv', 'text/csv', true);
    const body = UsersImportCommitResponseSchema.parse(res.json());
    // Carlos y Beto (con email) ahora son duplicate; SinMail (sin email) NO es
    // dedupable por correo → vuelve a contar como new, pero con nameWarning.
    expect(body.summary.new).toBe(1);
    expect(body.summary.nameWarnings).toBeGreaterThanOrEqual(1); // SinMail ahora avisa por nombre
    expect(body.result.created).toBe(1);
    // En DB: ahora hay 2 "SinMail Walkin" (el sin-email no se deduplica por correo).
    const dupes = await db.selectFrom('users').select(db.fn.countAll<string>().as('n'))
      .where('organization_id', '=', orgId).where('first_name', '=', 'SinMail').where('last_name', '=', 'Walkin').executeTakeFirstOrThrow();
    expect(Number(dupes.n)).toBe(2);
  });

  it('xlsx: mismo pipeline (preview clasifica)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hoja');
    ws.addRow(['Nombre', 'Apellido', 'Email', 'Teléfono']);
    ws.addRow(['Nuevo', 'EnExcel', `xlsx.${stamp}@ccb.do`, 12345]); // teléfono numérico → coacciona a texto
    ws.addRow(['Ana', 'X', EXISTING_EMAIL, '']); // duplicate
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await importReq(buf, 'visitantes.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', false);
    expect(res.statusCode).toBe(200);
    const body = UsersImportPreviewResponseSchema.parse(res.json());
    expect(body.summary).toMatchObject({ total: 2, new: 1, duplicates: 1 });
    expect(body.rows.find((r) => r.status === 'new')?.phone).toBe('12345');
  });

  it('plantilla descargable (csv y xlsx)', async () => {
    const csv = await app.inject({ method: 'GET', url: '/api/v2/users/import/template?format=csv', headers: { host }, cookies: { contan2_session: TOK.owner } });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-disposition']).toContain('plantilla-visitantes.csv');
    expect(csv.body).toContain('Nombre,Apellido,Email');
    const xlsx = await app.inject({ method: 'GET', url: '/api/v2/users/import/template?format=xlsx', headers: { host }, cookies: { contan2_session: TOK.owner } });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
  });
});
