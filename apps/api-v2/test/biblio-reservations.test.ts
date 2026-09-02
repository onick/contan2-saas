// apps/api-v2/test/biblio-reservations.test.ts · Biblioteca — F5 Reservas
// (mig 054). PG efímero (skip sin DATABASE_URL). Cola FIFO por título con
// promoción perezosa: espera → lista (copia apartada + ventana) → cumplida.

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

run('biblioteca · reservas F5', () => {
  let db: Kysely<Database>; let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `bibr-${stamp}`; const host = `${slug}.contan2.com`;
  const TOK = { biblio: `bibr-bib-${stamp}`, operator: `bibr-ope-${stamp}` };
  let orgId: string; let titleId: string;
  let anaCode: string; let anaId: string; let beaCode: string; let beaId: string;
  let resAnaId: string; let resBeaId: string;

  const req = (method: 'GET' | 'POST', url: string, token: string | null, body?: unknown) =>
    app.inject({ method, url, headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, ...(body !== undefined ? { payload: body } : {}) });

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'BIB' }).returning('id').executeTakeFirstOrThrow()).id;
    const mkStaff = async (token: string, role: string) => {
      const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-r-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role } as never).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    };
    await mkStaff(TOK.biblio, 'biblioteca');
    await mkStaff(TOK.operator, 'operator');

    anaId = randomUUID(); anaCode = `BIB-R${stamp % 100000}A`;
    await db.insertInto('users').values({ id: anaId, organization_id: orgId, code: anaCode, first_name: 'Ana', last_name: 'Primera' } as never).execute();
    beaId = randomUUID(); beaCode = `BIB-R${stamp % 100000}B`;
    await db.insertInto('users').values({ id: beaId, organization_id: orgId, code: beaCode, first_name: 'Bea', last_name: 'Segunda' } as never).execute();

    // Obra con UNA sola copia prestable.
    titleId = (await db.insertInto('biblio_titles').values({
      organization_id: orgId, kind: 'libro', title: 'Única Copia', authors: JSON.stringify(['Autora R']),
    } as never).returning('id').executeTakeFirstOrThrow()).id;
    await db.insertInto('biblio_items').values({
      organization_id: orgId, title_id: titleId, inventory_code: `R${stamp}-1`, physical_status: 'bueno', loanable: true,
    } as never).execute();

    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('biblio_reservations').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_loans').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_items').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_titles').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('RBAC: sin cookie 401 · operator 403', async () => {
    expect((await req('GET', '/api/v2/biblio/reservations', null)).statusCode).toBe(401);
    expect((await req('GET', '/api/v2/biblio/reservations', TOK.operator)).statusCode).toBe(403);
  });

  it('con copia libre la reserva queda LISTA al instante (copia apartada + ventana ~3 días)', async () => {
    const r = await req('POST', '/api/v2/biblio/reservations', TOK.biblio, { readerCode: anaCode, titleId });
    expect(r.statusCode).toBe(201);
    const res = r.json().reservation;
    resAnaId = res.id;
    expect(res.status).toBe('lista');
    expect(res.inventoryCode).toBe(`R${stamp}-1`);
    expect(res.code).toMatch(/^R-\d{6}$/);
    const days = (new Date(res.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2); expect(days).toBeLessThan(4.1);
  });

  it('la copia apartada NO se le presta a otra persona; duplicado de reserva 409', async () => {
    // Bea no puede llevarse el ejemplar apartado para Ana.
    const loan = await req('POST', '/api/v2/biblio/loans', TOK.biblio, { readerCode: beaCode, inventoryCode: `R${stamp}-1` });
    expect(loan.statusCode).toBe(409);
    expect(loan.json().error).toContain('apartado');
    // Ana no puede duplicar su reserva.
    expect((await req('POST', '/api/v2/biblio/reservations', TOK.biblio, { readerCode: anaCode, titleId })).statusCode).toBe(409);
  });

  it('Bea reserva → entra en ESPERA posición 1 (la copia está apartada)', async () => {
    const r = await req('POST', '/api/v2/biblio/reservations', TOK.biblio, { readerCode: beaCode, titleId });
    expect(r.statusCode).toBe(201);
    const res = r.json().reservation;
    resBeaId = res.id;
    expect(res.status).toBe('espera');
    expect(res.position).toBe(1);
  });

  it('ENTREGAR: prestar el ejemplar apartado a Ana cumple su reserva', async () => {
    const loan = await req('POST', '/api/v2/biblio/loans', TOK.biblio, { userId: anaId, inventoryCode: `R${stamp}-1` });
    expect(loan.statusCode).toBe(201);
    const row = await db.selectFrom('biblio_reservations').select(['status', 'loan_id'])
      .where('id', '=', resAnaId).executeTakeFirstOrThrow();
    expect(row.status).toBe('cumplida');
    expect(row.loan_id).toBeTruthy();
    // Reservar teniendo la obra prestada → 409.
    expect((await req('POST', '/api/v2/biblio/reservations', TOK.biblio, { readerCode: anaCode, titleId })).statusCode).toBe(409);
  });

  it('la DEVOLUCIÓN promueve la cola: la espera de Bea pasa a LISTA con la copia', async () => {
    expect((await req('POST', '/api/v2/biblio/returns', TOK.biblio, { inventoryCode: `R${stamp}-1` })).statusCode).toBe(200);
    const list = (await req('GET', '/api/v2/biblio/reservations?tab=listas', TOK.biblio)).json();
    expect(list.total).toBe(1);
    expect(list.reservations[0]).toMatchObject({ id: resBeaId, status: 'lista', inventoryCode: `R${stamp}-1`, userFirstName: 'Bea' });
  });

  it('cancelar libera la copia; resumen y reservas del lector reflejan todo', async () => {
    const c = await req('POST', `/api/v2/biblio/reservations/${resBeaId}/cancel`, TOK.biblio, {});
    expect(c.statusCode).toBe(200);
    expect(c.json().reservation.status).toBe('cancelada');

    const s = (await req('GET', '/api/v2/biblio/reservations/summary', TOK.biblio)).json();
    expect(s).toMatchObject({ activas: 0, enEspera: 0, paraRetirar: 0 });
    expect(s.policy).toEqual({ pickupDays: 3, maxActivePerReader: 3 });

    const deAna = (await req('GET', `/api/v2/biblio/readers/${anaId}/reservations`, TOK.biblio)).json();
    expect(deAna.reservations.map((x: { status: string }) => x.status)).toEqual(['cumplida']);

    const hist = (await req('GET', '/api/v2/biblio/reservations?tab=historial', TOK.biblio)).json();
    expect(hist.total).toBe(2); // cumplida + cancelada
  });
});
