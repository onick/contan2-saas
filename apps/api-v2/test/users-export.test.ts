// apps/api-v2/test/users-export.test.ts · integration (skip sin DATABASE_URL).
// PR-E1: GET /users/export?format=csv|xlsx&cohort=&status=&q=&scope=. Owner/admin;
// honra filtros (scope=view) o padrón completo (scope=all); CSV saneado + xlsx
// re-parseable; operator 403; formato inválido 400; ruta estática gana a :code.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('users · export del padrón (PR-E1)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `exp-${stamp}`;
  const host = `${slug}.contan2.com`;
  let orgId: string;
  const TOK = { owner: `exp-own-${stamp}`, op: `exp-op-${stamp}` };

  const mkStaff = async (token: string, role: 'owner' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${stamp}@t.local`, password_hash: 'x', full_name: role, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };

  let ipSeq = 0;
  const get = (qs: string, token = TOK.owner) => app.inject({
    method: 'GET', url: `/api/v2/users/export${qs}`,
    headers: { host, 'x-forwarded-for': `10.5.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}` },
    cookies: { contan2_session: token },
  });

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgId = (await db.insertInto('organizations').values({ slug, name: 'Export Org', status: 'active', primary_color: '#0182a2', secondary_color: '#f39228' }).returning('id').executeTakeFirstOrThrow()).id;
    await mkStaff(TOK.owner, 'owner');
    await mkStaff(TOK.op, 'operator');
    // 2 con email, 1 sin email, 1 archivado.
    await db.insertInto('users').values([
      { id: randomUUID(), organization_id: orgId, code: 'CCB-EXP001', first_name: 'Ana', last_name: 'Pérez', email: 'ana@ccb.do', phone: '809-1', visit_count: 5 },
      { id: randomUUID(), organization_id: orgId, code: 'CCB-EXP002', first_name: 'Beto', last_name: 'Gómez', email: 'beto@ccb.do', phone: null, visit_count: 0 },
      { id: randomUUID(), organization_id: orgId, code: 'CCB-EXP003', first_name: 'SinMail', last_name: 'Walkin', email: null, phone: '809-3', visit_count: 1 },
    ]).execute();
    const arch = randomUUID();
    await db.insertInto('users').values({ id: arch, organization_id: orgId, code: 'CCB-EXP004', first_name: 'Archi', last_name: 'Vado', email: 'archi@ccb.do', phone: null, visit_count: 2 }).execute();
    await db.updateTable('users').set({ deleted_at: new Date().toISOString() }).where('id', '=', arch).execute();
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

  it('operator → 403; formato inválido → 400', async () => {
    expect((await get('?format=csv', TOK.op)).statusCode).toBe(403);
    expect((await get('?format=pdf')).statusCode).toBe(400);
  });

  it('csv: ruta estática gana a :code; header + activos (sin archivado); BOM', async () => {
    const res = await get('?format=csv');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('padron-visitantes');
    const body = res.body;
    expect(body.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(body).toContain('Código,Nombre,Apellido,Email,Teléfono');
    expect(body).toContain('CCB-EXP001');
    expect(body).toContain('SinMail'); // sin email también
    expect(body).not.toContain('CCB-EXP004'); // archivado fuera por defecto
    // 3 activos + header = 4 líneas no vacías
    expect(body.trim().split(/\r\n/).filter(Boolean).length).toBe(4);
  });

  it('honra cohorte noEmail (scope=view)', async () => {
    const body = (await get('?format=csv&cohort=noEmail')).body;
    expect(body).toContain('CCB-EXP003');
    expect(body).not.toContain('CCB-EXP001');
    expect(body.trim().split(/\r\n/).filter(Boolean).length).toBe(2); // header + 1
  });

  it('honra búsqueda (scope=view) y la IGNORA con scope=all', async () => {
    expect((await get('?format=csv&q=Ana')).body).not.toContain('CCB-EXP002');
    // scope=all ignora cohorte+búsqueda (sigue respetando estado activo)
    const all = (await get('?format=csv&q=Ana&scope=all')).body;
    expect(all).toContain('CCB-EXP001');
    expect(all).toContain('CCB-EXP002');
    expect(all).toContain('CCB-EXP003');
  });

  it('status=archived exporta sólo archivados', async () => {
    const body = (await get('?format=csv&status=archived')).body;
    expect(body).toContain('CCB-EXP004');
    expect(body).not.toContain('CCB-EXP001');
  });

  it('xlsx: workbook re-parseable, hoja Visitantes con header y filas', async () => {
    const res = await get('?format=xlsx');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    const ws = wb.getWorksheet('Visitantes');
    expect(ws).toBeTruthy();
    const flat = JSON.stringify(ws!.getSheetValues());
    expect(flat).toContain('Código');
    expect(flat).toContain('CCB-EXP001');
  });
});
