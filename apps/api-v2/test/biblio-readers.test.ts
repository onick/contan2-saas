// apps/api-v2/test/biblio-readers.test.ts · Biblioteca — Lectores (mig 052).
// PG efímero (skip sin DATABASE_URL). El lector ES el padrón (users) + perfil
// bibliotecario encima. RBAC rol 'biblioteca'; alta con carné real; búsqueda
// por cédula; suspensión del servicio; KPIs.

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('biblioteca · lectores', () => {
  let db: Kysely<Database>; let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `bibl-${stamp}`; const host = `${slug}.contan2.com`;
  const TOK = { admin: `bibl-adm-${stamp}`, biblio: `bibl-bib-${stamp}`, operator: `bibl-ope-${stamp}` };
  let orgId: string; let anaId: string; let createdId: string;

  const req = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string | null, body?: unknown) =>
    app.inject({ method, url, headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, ...(body !== undefined ? { payload: body } : {}) });

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'BIB' }).returning('id').executeTakeFirstOrThrow()).id;
    const mkStaff = async (token: string, role: string) => {
      const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-l-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role } as never).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    };
    await mkStaff(TOK.admin, 'admin');
    await mkStaff(TOK.biblio, 'biblioteca');
    await mkStaff(TOK.operator, 'operator');
    // Padrón preexistente: Ana (activa) + Beto (archivado).
    anaId = randomUUID();
    await db.insertInto('users').values({
      id: anaId, organization_id: orgId, code: `BIB-L${stamp % 100000}A`,
      first_name: 'Ana', last_name: 'Del Padrón', email: `ana-l-${stamp}@t.local`, phone: '(809) 555-0001',
    } as never).execute();
    await db.insertInto('users').values({
      id: randomUUID(), organization_id: orgId, code: `BIB-L${stamp % 100000}B`,
      first_name: 'Beto', last_name: 'Archivado', email: null, phone: null, deleted_at: new Date().toISOString(),
    } as never).execute();
    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('biblio_member_profiles').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('RBAC: sin cookie 401 · operator 403 · biblioteca 200', async () => {
    expect((await req('GET', '/api/v2/biblio/readers', null)).statusCode).toBe(401);
    expect((await req('GET', '/api/v2/biblio/readers', TOK.operator)).statusCode).toBe(403);
    expect((await req('GET', '/api/v2/biblio/readers', TOK.biblio)).statusCode).toBe(200);
  });

  it('lista: el padrón aparece sin perfil (no_empleado por defecto); archivados fuera', async () => {
    const list = (await req('GET', '/api/v2/biblio/readers', TOK.biblio)).json();
    const nombres = list.readers.map((r: { firstName: string }) => r.firstName);
    expect(nombres).toContain('Ana');
    expect(nombres).not.toContain('Beto'); // archivado fuera por defecto
    const ana = list.readers.find((r: { firstName: string }) => r.firstName === 'Ana');
    expect(ana).toMatchObject({ readerType: 'no_empleado', suspendedAt: null, archived: false });
    // Con estado=archivado aparece Beto.
    const arch = (await req('GET', '/api/v2/biblio/readers?estado=archivado', TOK.admin)).json();
    expect(arch.readers.map((r: { firstName: string }) => r.firstName)).toEqual(['Beto']);
  });

  it('alta al padrón: carné real con prefijo + perfil empleado; email duplicado 409', async () => {
    const r = await req('POST', '/api/v2/biblio/readers', TOK.biblio, {
      firstName: 'Carla', lastName: 'Empleada', email: `carla-l-${stamp}@t.local`,
      document: '001-1234567-8', readerType: 'empleado', employeeCode: 'EMP-0042',
    });
    expect(r.statusCode).toBe(201);
    const reader = r.json().reader;
    createdId = reader.userId;
    expect(reader.code.startsWith('BIB')).toBe(true); // carné del centro, prefijo real
    expect(reader).toMatchObject({ readerType: 'empleado', employeeCode: 'EMP-0042', document: '001-1234567-8' });
    // Email duplicado en el padrón → 409 claro.
    const dup = await req('POST', '/api/v2/biblio/readers', TOK.admin, {
      firstName: 'Otra', lastName: 'Carla', email: `carla-l-${stamp}@t.local`,
    });
    expect(dup.statusCode).toBe(409);
  });

  it('búsqueda por cédula y por código RRHH; filtro por tipo', async () => {
    const byDoc = (await req('GET', `/api/v2/biblio/readers?q=${encodeURIComponent('001-1234567')}`, TOK.admin)).json();
    expect(byDoc.readers.map((r: { firstName: string }) => r.firstName)).toEqual(['Carla']);
    const byEmp = (await req('GET', '/api/v2/biblio/readers?q=emp-0042', TOK.admin)).json();
    expect(byEmp.total).toBe(1);
    const empleados = (await req('GET', '/api/v2/biblio/readers?type=empleado', TOK.admin)).json();
    expect(empleados.readers.map((r: { firstName: string }) => r.firstName)).toEqual(['Carla']);
    const noEmpleados = (await req('GET', '/api/v2/biblio/readers?type=no_empleado', TOK.admin)).json();
    expect(noEmpleados.readers.map((r: { firstName: string }) => r.firstName)).toContain('Ana');
  });

  it('perfil: upsert sobre padrón SIN perfil previo (Ana → empleada con cédula)', async () => {
    const r = await req('PATCH', `/api/v2/biblio/readers/${anaId}/profile`, TOK.biblio, {
      readerType: 'empleado', employeeCode: 'EMP-0001', document: '001-7654321-0', notes: 'Turno mañana',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().reader).toMatchObject({ readerType: 'empleado', employeeCode: 'EMP-0001', notes: 'Turno mañana' });
    // Volver a no_empleado limpia el código RRHH.
    const back = (await req('PATCH', `/api/v2/biblio/readers/${anaId}/profile`, TOK.admin, { readerType: 'no_empleado', employeeCode: 'EMP-0001' })).json();
    expect(back.reader).toMatchObject({ readerType: 'no_empleado', employeeCode: null });
  });

  it('suspensión: bloquea el servicio (no toca el padrón), filtra y cuenta; reactivar limpia', async () => {
    const r = await req('POST', `/api/v2/biblio/readers/${createdId}/suspend`, TOK.biblio, { suspended: true, reason: 'Material sin devolver' });
    expect(r.statusCode).toBe(200);
    expect(r.json().reader.suspendedReason).toBe('Material sin devolver');

    const susp = (await req('GET', '/api/v2/biblio/readers?estado=suspendido', TOK.admin)).json();
    expect(susp.readers.map((re: { firstName: string }) => re.firstName)).toEqual(['Carla']);

    const stats = (await req('GET', '/api/v2/biblio/readers/stats', TOK.biblio)).json();
    expect(stats.suspended).toBe(1);
    expect(stats.total).toBe(stats.active + stats.suspended);
    expect(stats.newThisMonth).toBeGreaterThanOrEqual(1); // Carla se creó hoy

    const re = await req('POST', `/api/v2/biblio/readers/${createdId}/suspend`, TOK.admin, { suspended: false });
    expect(re.json().reader).toMatchObject({ suspendedAt: null, suspendedReason: null });
    const audit = await db.selectFrom('tenant_audit_log').select('action')
      .where('organization_id', '=', orgId).where('action', '=', 'biblio.reader.reactivated').executeTakeFirst();
    expect(audit).toBeTruthy();
  });
});
