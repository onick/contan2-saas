// apps/api-v2/test/biblio-inventories.test.ts · Biblioteca — F6 Inventario
// (mig 055). PG efímero (skip sin DATABASE_URL). Sesión de conteo: escaneo con
// resultado derivado; prestados NO son faltantes; resumen congelado al cerrar.

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

run('biblioteca · inventario F6', () => {
  let db: Kysely<Database>; let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `bibi-${stamp}`; const host = `${slug}.contan2.com`;
  const TOK = { biblio: `bibi-bib-${stamp}`, operator: `bibi-ope-${stamp}` };
  let orgId: string; let siteA: string; let siteB: string; let invId: string;

  const req = (method: 'GET' | 'POST', url: string, token: string | null, body?: unknown) =>
    app.inject({ method, url, headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, ...(body !== undefined ? { payload: body } : {}) });

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'BIB' }).returning('id').executeTakeFirstOrThrow()).id;
    const mkStaff = async (token: string, role: string) => {
      const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-i-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role } as never).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    };
    await mkStaff(TOK.biblio, 'biblioteca');
    await mkStaff(TOK.operator, 'operator');

    siteA = (await db.insertInto('biblio_sites').values({ organization_id: orgId, name: 'Sala A' } as never).returning('id').executeTakeFirstOrThrow()).id;
    siteB = (await db.insertInto('biblio_sites').values({ organization_id: orgId, name: 'Depósito B' } as never).returning('id').executeTakeFirstOrThrow()).id;

    const titleId = (await db.insertInto('biblio_titles').values({
      organization_id: orgId, kind: 'libro', title: 'Obra Inventariada', authors: JSON.stringify(['Autora I']),
    } as never).returning('id').executeTakeFirstOrThrow()).id;
    const mkItem = async (code: string, site: string | null) => (await db.insertInto('biblio_items').values({
      organization_id: orgId, title_id: titleId, inventory_code: code,
      physical_status: 'bueno', loanable: true, site_id: site,
    } as never).returning('id').executeTakeFirstOrThrow()).id;
    await mkItem(`I${stamp}-1`, siteA); // se escaneará → encontrado
    await mkItem(`I${stamp}-2`, siteA); // NO se escanea, sin préstamo → faltante
    const i3 = await mkItem(`I${stamp}-3`, siteA); // NO se escanea, PRESTADO → no faltante
    await mkItem(`I${stamp}-4`, siteB); // de otro sitio; al escanearlo en A → fuera de ubicación

    // Préstamo abierto del ejemplar 3.
    const uid = randomUUID();
    await db.insertInto('users').values({ id: uid, organization_id: orgId, code: `BIB-I${stamp % 100000}`, first_name: 'Lector', last_name: 'Inv' } as never).execute();
    await db.insertInto('biblio_loans').values({
      organization_id: orgId, item_id: i3, user_id: uid, kind: 'domicilio',
      due_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    } as never).execute();

    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('biblio_inventory_scans').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_inventories').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_loans').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_items').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_titles').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_sites').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('RBAC + abrir sesión de un sitio; segunda sesión abierta → 409', async () => {
    expect((await req('GET', '/api/v2/biblio/inventories', null)).statusCode).toBe(401);
    expect((await req('GET', '/api/v2/biblio/inventories', TOK.operator)).statusCode).toBe(403);
    const r = await req('POST', '/api/v2/biblio/inventories', TOK.biblio, { name: 'Anual Sala A', siteId: siteA });
    expect(r.statusCode).toBe(201);
    const inv = r.json().inventory;
    invId = inv.id;
    expect(inv).toMatchObject({ status: 'en_progreso', siteName: 'Sala A', expected: 3, scanned: 0, onLoan: 1 });
    expect((await req('POST', '/api/v2/biblio/inventories', TOK.biblio, { name: 'Otra' })).statusCode).toBe(409);
  });

  it('escanear: encontrado · repetido ya_escaneado · de otro sitio fuera_ubicacion · inexistente 404', async () => {
    const ok = (await req('POST', `/api/v2/biblio/inventories/${invId}/scan`, TOK.biblio, { inventoryCode: `i${stamp}-1` })).json();
    expect(ok.result).toBe('encontrado');
    expect(ok.scanned).toBe(1);
    const dup = (await req('POST', `/api/v2/biblio/inventories/${invId}/scan`, TOK.biblio, { inventoryCode: `I${stamp}-1` })).json();
    expect(dup.result).toBe('ya_escaneado');
    const fuera = (await req('POST', `/api/v2/biblio/inventories/${invId}/scan`, TOK.biblio, { inventoryCode: `I${stamp}-4` })).json();
    expect(fuera.result).toBe('fuera_ubicacion');
    expect((await req('POST', `/api/v2/biblio/inventories/${invId}/scan`, TOK.biblio, { inventoryCode: 'NO-EXISTE' })).statusCode).toBe(404);
  });

  it('filas por tab: pendientes excluyen prestados; fuera de ubicación lista al intruso', async () => {
    const falt = (await req('GET', `/api/v2/biblio/inventories/${invId}/items?tab=faltantes`, TOK.biblio)).json();
    expect(falt.items.map((x: { inventoryCode: string }) => x.inventoryCode)).toEqual([`I${stamp}-2`]);
    expect(falt.items[0].resultado).toBe('pendiente'); // sesión abierta
    const prest = (await req('GET', `/api/v2/biblio/inventories/${invId}/items?tab=prestados`, TOK.biblio)).json();
    expect(prest.items.map((x: { inventoryCode: string }) => x.inventoryCode)).toEqual([`I${stamp}-3`]);
    expect(prest.items[0]).toMatchObject({ resultado: 'prestado', estado: 'prestado' });
    const fuera = (await req('GET', `/api/v2/biblio/inventories/${invId}/items?tab=fuera`, TOK.biblio)).json();
    // BIB-08a: el ejemplar del Depósito B escaneado en Sala A entra al alcance
    // (registrados en A + escaneados en la sesión) y se lista como intruso.
    expect(fuera.items.map((x: { inventoryCode: string }) => x.inventoryCode)).toEqual([`I${stamp}-4`]);
    expect(fuera.total).toBe(1);
    expect(fuera.items[0]).toMatchObject({ resultado: 'fuera_ubicacion', siteName: 'Depósito B' });
    // Es un EXTRA: no descuenta esperados ni cambia faltantes/prestados.
    const live = (await req('GET', '/api/v2/biblio/inventories', TOK.biblio)).json().active;
    expect(live).toMatchObject({ expected: 3, scanned: 2, found: 1, misplaced: 1, onLoan: 1, missing: 1 });
    const esc = (await req('GET', `/api/v2/biblio/inventories/${invId}/items?tab=escaneados`, TOK.biblio)).json();
    expect(esc.total).toBe(2);
  });

  it('finalizar: congela el resumen (faltante real = 1; prestado no cuenta); repetir 409', async () => {
    const r = await req('POST', `/api/v2/biblio/inventories/${invId}/finish`, TOK.biblio, {});
    expect(r.statusCode).toBe(200);
    const inv = r.json().inventory;
    expect(inv).toMatchObject({ status: 'finalizado', expected: 3, scanned: 2, found: 1, misplaced: 1, onLoan: 1, missing: 1 });
    expect((await req('POST', `/api/v2/biblio/inventories/${invId}/finish`, TOK.biblio, {})).statusCode).toBe(409);
    // Tras cerrar, el pendiente pasa a FALTANTE.
    const falt = (await req('GET', `/api/v2/biblio/inventories/${invId}/items?tab=faltantes`, TOK.biblio)).json();
    expect(falt.items[0].resultado).toBe('faltante');
    // Y ya se puede abrir una nueva sesión.
    const list = (await req('GET', '/api/v2/biblio/inventories', TOK.biblio)).json();
    expect(list.active).toBeNull();
    expect(list.previous[0]).toMatchObject({ id: invId, missing: 1 });
  });

  it('export .xlsx: zip real con resultados; RBAC 403 para operator', async () => {
    expect((await req('GET', `/api/v2/biblio/inventories/${invId}/export.xlsx`, TOK.operator)).statusCode).toBe(403);
    const r = await req('GET', `/api/v2/biblio/inventories/${invId}/export.xlsx`, TOK.biblio);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    expect(r.rawPayload.subarray(0, 2).toString()).toBe('PK');
    // El intruso (fuera de ubicación) y los 3 esperados figuran en el Excel congelado.
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.rawPayload as never);
    const ws = wb.getWorksheet('Inventario')!;
    const lines = Array.from({ length: ws.rowCount }, (_, i) => ws.getRow(i + 1).values as unknown[]).map((v) => v.join('|'));
    expect(lines.some((l) => l.includes(`I${stamp}-4`) && l.includes('Fuera de ubicación'))).toBe(true);
    expect(lines.filter((l) => l.includes(`I${stamp}-`)).length).toBe(4);
  });

  it('bajas: los ejemplares retirados aparecen con su motivo', async () => {
    await db.updateTable('biblio_items')
      .set({ retired_at: new Date().toISOString(), retired_reason: 'Deterioro total', physical_status: 'baja' })
      .where('organization_id', '=', orgId)
      .where('inventory_code', '=', `I${stamp}-2`)
      .execute();
    const r = (await req('GET', '/api/v2/biblio/retired-items', TOK.biblio)).json();
    expect(r.total).toBe(1);
    expect(r.items[0]).toMatchObject({ inventoryCode: `I${stamp}-2`, estado: 'baja', retiredReason: 'Deterioro total' });
  });
});
