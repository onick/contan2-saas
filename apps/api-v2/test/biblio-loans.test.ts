// apps/api-v2/test/biblio-loans.test.ts · Biblioteca — F2 Circulación (mig 053).
// PG efímero (skip sin DATABASE_URL). Ledger inmutable: vencido DERIVADO;
// flujo de 2 escaneos (carné + ejemplar); política 14 días / 2 renov / 3 abiertos.

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

run('biblioteca · circulación F2', () => {
  let db: Kysely<Database>; let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `bibc-${stamp}`; const host = `${slug}.contan2.com`;
  const TOK = { biblio: `bibc-bib-${stamp}`, operator: `bibc-ope-${stamp}` };
  let orgId: string; let titleId: string;
  let anaCode: string; let anaId: string; let suspCode: string;
  let loanId: string;

  const req = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string | null, body?: unknown) =>
    app.inject({ method, url, headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, ...(body !== undefined ? { payload: body } : {}) });

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'BIB' }).returning('id').executeTakeFirstOrThrow()).id;
    const mkStaff = async (token: string, role: string) => {
      const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-c-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role } as never).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    };
    await mkStaff(TOK.biblio, 'biblioteca');
    await mkStaff(TOK.operator, 'operator');

    // Lectores: Ana (ok) + Susana (suspendida de biblioteca).
    anaId = randomUUID(); anaCode = `BIB-C${stamp % 100000}A`;
    await db.insertInto('users').values({ id: anaId, organization_id: orgId, code: anaCode, first_name: 'Ana', last_name: 'Lectora' } as never).execute();
    const suspId = randomUUID(); suspCode = `BIB-C${stamp % 100000}S`;
    await db.insertInto('users').values({ id: suspId, organization_id: orgId, code: suspCode, first_name: 'Susana', last_name: 'Suspendida' } as never).execute();
    await db.insertInto('biblio_member_profiles').values({
      organization_id: orgId, user_id: suspId, suspended_at: new Date().toISOString(), suspended_reason: 'test',
    } as never).execute();

    // Obra con 5 ejemplares: 4 buenos (uno solo-sala) + 1 en reparación.
    titleId = (await db.insertInto('biblio_titles').values({
      organization_id: orgId, kind: 'libro', title: 'Manual de Circulación', authors: JSON.stringify(['Autora Test']),
    } as never).returning('id').executeTakeFirstOrThrow()).id;
    const mkItem = async (code: string, status: string, loanable: boolean) => {
      await db.insertInto('biblio_items').values({
        organization_id: orgId, title_id: titleId, inventory_code: code,
        physical_status: status, loanable,
      } as never).execute();
    };
    await mkItem(`C${stamp}-1`, 'bueno', true);
    await mkItem(`C${stamp}-2`, 'bueno', true);
    await mkItem(`C${stamp}-3`, 'bueno', true);
    await mkItem(`C${stamp}-4`, 'bueno', false);      // solo sala
    await mkItem(`C${stamp}-5`, 'reparacion', true);  // no circula

    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('biblio_loans').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_member_profiles').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_items').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_titles').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('RBAC: sin cookie 401 · operator 403', async () => {
    expect((await req('GET', '/api/v2/biblio/loans', null)).statusCode).toBe(401);
    expect((await req('GET', '/api/v2/biblio/loans', TOK.operator)).statusCode).toBe(403);
  });

  it('precheck: carné + ejemplar válidos antes de confirmar', async () => {
    const r = (await req('GET', `/api/v2/biblio/loans/precheck?readerCode=${anaCode}&inventoryCode=C${stamp}-1`, TOK.biblio)).json();
    expect(r.reader).toMatchObject({ firstName: 'Ana', suspended: false, openLoans: 0, maxOpenLoans: 3 });
    expect(r.item).toMatchObject({ inventoryCode: `C${stamp}-1`, onLoan: false, retired: false });
  });

  it('prestar (2 escaneos): 201, vence en ~14 días, doble préstamo del mismo ejemplar 409', async () => {
    const r = await req('POST', '/api/v2/biblio/loans', TOK.biblio, { readerCode: anaCode, inventoryCode: `c${stamp}-1` }); // case-insensitive
    expect(r.statusCode).toBe(201);
    const loan = r.json().loan;
    loanId = loan.id;
    expect(loan).toMatchObject({ status: 'a_tiempo', kind: 'domicilio', renewals: 0, userCode: anaCode });
    const days = (new Date(loan.dueAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13); expect(days).toBeLessThan(15.1);
    // Mismo ejemplar de nuevo → 409 (índice parcial del ledger).
    expect((await req('POST', '/api/v2/biblio/loans', TOK.biblio, { readerCode: anaCode, inventoryCode: `C${stamp}-1` })).statusCode).toBe(409);
    // El precheck ahora lo marca prestado.
    const pre = (await req('GET', `/api/v2/biblio/loans/precheck?inventoryCode=C${stamp}-1`, TOK.biblio)).json();
    expect(pre.item.onLoan).toBe(true);
  });

  it('validaciones: suspendida 409 · reparación 409 · solo-sala a domicilio 409 pero EN SALA sí', async () => {
    expect((await req('POST', '/api/v2/biblio/loans', TOK.biblio, { readerCode: suspCode, inventoryCode: `C${stamp}-2` })).statusCode).toBe(409);
    expect((await req('POST', '/api/v2/biblio/loans', TOK.biblio, { readerCode: anaCode, inventoryCode: `C${stamp}-5` })).statusCode).toBe(409);
    expect((await req('POST', '/api/v2/biblio/loans', TOK.biblio, { readerCode: anaCode, inventoryCode: `C${stamp}-4`, kind: 'domicilio' })).statusCode).toBe(409);
    const sala = await req('POST', '/api/v2/biblio/loans', TOK.biblio, { readerCode: anaCode, inventoryCode: `C${stamp}-4`, kind: 'sala' });
    expect(sala.statusCode).toBe(201);
    expect(sala.json().loan.status).toBe('en_sala'); // vence HOY, no cuenta contra el límite de domicilio
  });

  it('límite de préstamos abiertos: el 4to a domicilio rebota', async () => {
    expect((await req('POST', '/api/v2/biblio/loans', TOK.biblio, { readerCode: anaCode, inventoryCode: `C${stamp}-2` })).statusCode).toBe(201);
    expect((await req('POST', '/api/v2/biblio/loans', TOK.biblio, { readerCode: anaCode, inventoryCode: `C${stamp}-3` })).statusCode).toBe(201);
    // Ana ya tiene 4 abiertos (3 domicilio + 1 sala) → domicilio nuevo rebota por límite.
    const otra = await db.insertInto('biblio_items').values({
      organization_id: orgId, title_id: titleId, inventory_code: `C${stamp}-6`, physical_status: 'bueno', loanable: true,
    } as never).returning('inventory_code').executeTakeFirstOrThrow();
    const r = await req('POST', '/api/v2/biblio/loans', TOK.biblio, { readerCode: anaCode, inventoryCode: otra.inventory_code });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toContain('Límite');
  });

  it('renovar: +14 días y contador; máximo 2; sala no se renueva', async () => {
    const r1 = await req('POST', `/api/v2/biblio/loans/${loanId}/renew`, TOK.biblio, {});
    expect(r1.statusCode).toBe(200);
    expect(r1.json().loan.renewals).toBe(1);
    expect((await req('POST', `/api/v2/biblio/loans/${loanId}/renew`, TOK.biblio, {})).json().loan.renewals).toBe(2);
    expect((await req('POST', `/api/v2/biblio/loans/${loanId}/renew`, TOK.biblio, {})).statusCode).toBe(409); // máx 2
    // Sala no se renueva.
    const salaLoan = (await req('GET', '/api/v2/biblio/loans?tab=activos&q=' + encodeURIComponent(`C${stamp}-4`), TOK.biblio)).json().loans[0];
    expect((await req('POST', `/api/v2/biblio/loans/${salaLoan.id}/renew`, TOK.biblio, {})).statusCode).toBe(409);
  });

  it('catálogo consciente de préstamos: itemsLoaned y ejemplar con lector en la ficha', async () => {
    const list = (await req('GET', `/api/v2/biblio/titles?q=${encodeURIComponent('manual de circ')}`, TOK.biblio)).json();
    expect(list.titles[0].itemsLoaned).toBe(4); // 3 domicilio + 1 sala abiertos
    const detail = (await req('GET', `/api/v2/biblio/titles/${titleId}`, TOK.biblio)).json();
    const i1 = detail.items.find((x: { inventoryCode: string }) => x.inventoryCode === `C${stamp}-1`);
    expect(i1).toMatchObject({ onLoan: true, loanReaderName: 'Ana Lectora' });
    expect(i1.loanDueAt).toBeTruthy();
  });

  it('devolver por escaneo: cierra el préstamo; repetir 409; tabs y lector reflejan', async () => {
    const r = await req('POST', '/api/v2/biblio/returns', TOK.biblio, { inventoryCode: `C${stamp}-1` });
    expect(r.statusCode).toBe(200);
    expect(r.json().loan.status).toBe('devuelto');
    expect((await req('POST', '/api/v2/biblio/returns', TOK.biblio, { inventoryCode: `C${stamp}-1` })).statusCode).toBe(409);

    const activos = (await req('GET', '/api/v2/biblio/loans?tab=activos', TOK.biblio)).json();
    expect(activos.total).toBe(3);
    const devueltos = (await req('GET', '/api/v2/biblio/loans?tab=devueltos', TOK.biblio)).json();
    expect(devueltos.total).toBe(1);
    const renovados = (await req('GET', '/api/v2/biblio/loans?tab=renovados', TOK.biblio)).json();
    expect(renovados.total).toBe(0); // el renovado fue justo el devuelto

    const deAna = (await req('GET', `/api/v2/biblio/readers/${anaId}/loans`, TOK.biblio)).json();
    expect(deAna.loans.length).toBe(4);
    expect(deAna.loans.filter((l: { returnedAt: string | null }) => !l.returnedAt).length).toBe(3);
  });

  it('resumen del día: préstamos/devoluciones de hoy + abiertos + política', async () => {
    const s = (await req('GET', '/api/v2/biblio/loans/summary', TOK.biblio)).json();
    expect(s.today.loans).toBe(4);
    expect(s.today.returns).toBe(1);
    expect(s.today.renewals).toBe(2);
    expect(s.alerts.activeTotal).toBe(3);
    expect(s.alerts.overdue).toBe(0);
    expect(s.policy).toEqual({ loanDays: 14, maxRenewals: 2, maxOpenLoans: 3 });
  });
});
