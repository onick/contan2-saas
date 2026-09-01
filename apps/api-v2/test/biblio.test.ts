// apps/api-v2/test/biblio.test.ts · Módulo Biblioteca F1 (catálogo).
// PG efímero (skip sin DATABASE_URL). D1 título≠ejemplar · D9 sitio→estante ·
// D8 autofill ISBN (fetch inyectado, sin red) · RBAC rol 'biblioteca'.

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';
import { lookupIsbn, normalizeIsbn } from '../src/services/biblio-isbn.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('biblioteca · catálogo F1', () => {
  let db: Kysely<Database>; let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `bib-${stamp}`; const host = `${slug}.contan2.com`;
  const TOK = { admin: `bib-adm-${stamp}`, biblio: `bib-bib-${stamp}`, operator: `bib-ope-${stamp}` };
  let orgId: string; let siteId: string; let titleId: string;

  const req = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string | null, body?: unknown) =>
    app.inject({ method, url, headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, ...(body !== undefined ? { payload: body } : {}) });

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'BIB' }).returning('id').executeTakeFirstOrThrow()).id;
    const mkStaff = async (token: string, role: string) => {
      const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role } as never).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    };
    await mkStaff(TOK.admin, 'admin');
    await mkStaff(TOK.biblio, 'biblioteca'); // rol nuevo (mig 049)
    await mkStaff(TOK.operator, 'operator');
    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('biblio_items').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_titles').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_sites').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('biblio_isbn_cache').where('isbn', 'in', ['9789945000012', '9789945000029']).execute();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('RBAC: sin cookie 401 · operator 403 · rol biblioteca SÍ entra', async () => {
    expect((await req('GET', '/api/v2/biblio/titles', null)).statusCode).toBe(401);
    expect((await req('GET', '/api/v2/biblio/titles', TOK.operator)).statusCode).toBe(403);
    expect((await req('GET', '/api/v2/biblio/titles', TOK.biblio)).statusCode).toBe(200);
  });

  it('sitios: crear (D9) + duplicado 409 + listar', async () => {
    const r1 = await req('POST', '/api/v2/biblio/sites', TOK.admin, { name: 'Biblioteca' });
    expect(r1.statusCode).toBe(201);
    siteId = r1.json().site.id;
    expect((await req('POST', '/api/v2/biblio/sites', TOK.admin, { name: 'Almacén KM23' })).statusCode).toBe(201);
    expect((await req('POST', '/api/v2/biblio/sites', TOK.admin, { name: 'biblioteca' })).statusCode).toBe(409); // case-insensitive
    const list = (await req('GET', '/api/v2/biblio/sites', TOK.biblio)).json();
    expect(list.sites.map((s: { name: string }) => s.name).sort()).toEqual(['Almacén KM23', 'Biblioteca']);
  });

  it('títulos: crear ficha completa y leerla con conteos en cero', async () => {
    const r = await req('POST', '/api/v2/biblio/titles', TOK.biblio, {
      kind: 'libro', isbn: '978-9945-000-01-2', title: 'Cien años de soledad',
      subtitle: null, authors: ['García Márquez, Gabriel'], publisher: 'Sudamericana',
      year: 1967, language: 'Español', subjects: ['Novela', 'Realismo mágico'], keywords: [],
      dewey: '863', callNumber: '863 G216c', isbnAutofilled: false,
    });
    expect(r.statusCode).toBe(201);
    const t = r.json().title;
    titleId = t.id;
    expect(t).toMatchObject({ title: 'Cien años de soledad', authors: ['García Márquez, Gabriel'], itemsTotal: 0, itemsActive: 0 });
    expect(t.subjects).toEqual(['Novela', 'Realismo mágico']);
    // Auditoría de la creación.
    const audit = await db.selectFrom('tenant_audit_log').select('action').where('organization_id', '=', orgId).where('action', '=', 'biblio.title.created').executeTakeFirst();
    expect(audit).toBeTruthy();
  });

  it('búsqueda: por fragmento de título, por autor y por ISBN con guiones; filtro por tipo', async () => {
    await req('POST', '/api/v2/biblio/titles', TOK.admin, { kind: 'revista', title: 'Revista de Arte Dominicano', authors: [], subjects: [], keywords: [] });
    const byTitle = (await req('GET', '/api/v2/biblio/titles?q=cien%20a', TOK.admin)).json();
    expect(byTitle.titles.map((x: { title: string }) => x.title)).toEqual(['Cien años de soledad']);
    const byAuthor = (await req('GET', '/api/v2/biblio/titles?q=garcia%20marquez', TOK.admin)).json();
    expect(byAuthor.total).toBe(0); // sin acentos NO matchea el jsonb crudo (v1: acentos exactos)
    const byAuthorAcc = (await req('GET', `/api/v2/biblio/titles?q=${encodeURIComponent('García Márquez')}`, TOK.admin)).json();
    expect(byAuthorAcc.total).toBe(1);
    const byIsbn = (await req('GET', `/api/v2/biblio/titles?q=${encodeURIComponent('978-9945-000-01-2')}`, TOK.admin)).json();
    expect(byIsbn.total).toBe(1);
    const kindRevista = (await req('GET', '/api/v2/biblio/titles?kind=revista', TOK.admin)).json();
    expect(kindRevista.titles[0].title).toBe('Revista de Arte Dominicano');
  });

  it('ejemplares (D1): dos copias con ubicación sitio→estante, código duplicado 409, conteos', async () => {
    const r1 = await req('POST', `/api/v2/biblio/titles/${titleId}/items`, TOK.biblio,
      { inventoryCode: 'bib-000001', siteId, shelf: 'Estante B-14', physicalStatus: 'bueno', loanable: true });
    expect(r1.statusCode).toBe(201);
    expect((await req('POST', `/api/v2/biblio/titles/${titleId}/items`, TOK.biblio,
      { inventoryCode: 'BIB-000001', physicalStatus: 'bueno', loanable: true })).statusCode).toBe(409); // case-insensitive
    expect((await req('POST', `/api/v2/biblio/titles/${titleId}/items`, TOK.biblio,
      { inventoryCode: 'BIB-000002', physicalStatus: 'reparacion', loanable: true })).statusCode).toBe(201);

    const detail = (await req('GET', `/api/v2/biblio/titles/${titleId}`, TOK.admin)).json();
    expect(detail.title.itemsTotal).toBe(2);
    expect(detail.title.itemsActive).toBe(1); // 'reparacion' no cuenta como activo
    const i1 = detail.items.find((i: { inventoryCode: string }) => i.inventoryCode === 'BIB-000001');
    expect(i1).toMatchObject({ siteName: 'Biblioteca', shelf: 'Estante B-14', physicalStatus: 'bueno' });
  });

  it('baja lógica: conserva la fila, marca motivo y sale de los conteos', async () => {
    const detail = (await req('GET', `/api/v2/biblio/titles/${titleId}`, TOK.admin)).json();
    const id = detail.items.find((i: { inventoryCode: string }) => i.inventoryCode === 'BIB-000001').id;
    const r = await req('PATCH', `/api/v2/biblio/items/${id}`, TOK.admin, { retiredReason: 'Extraviado en mudanza' });
    expect(r.statusCode).toBe(200);
    const after = (await req('GET', `/api/v2/biblio/titles/${titleId}`, TOK.admin)).json();
    expect(after.title.itemsTotal).toBe(1); // la baja no cuenta
    const gone = after.items.find((i: { id: string }) => i.id === id);
    expect(gone).toMatchObject({ physicalStatus: 'baja', retiredReason: 'Extraviado en mudanza' });
    expect(gone.retiredAt).toBeTruthy();
  });

  it('ISBN (D8): normaliza, mapea OpenLibrary, cachea y no repite el fetch', async () => {
    expect(normalizeIsbn('978-9945-000-01-2')).toBe('9789945000012');
    const olBody = {
      'ISBN:9789945000012': {
        title: 'Un siglo', subtitle: 'La dimensión artística',
        authors: [{ name: 'V. Alcántara' }], publishers: [{ name: 'Banreservas' }],
        publish_date: 'March 2026', cover: { large: 'https://covers.example/l.jpg' },
      },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(olBody), { status: 200 }));
    const r1 = await lookupIsbn(db as never, '978-9945-000-01-2', fetchMock as never);
    expect(r1.found).toBe(true);
    expect(r1.source).toBe('openlibrary');
    expect(r1.data).toMatchObject({ title: 'Un siglo', authors: ['V. Alcántara'], publisher: 'Banreservas', year: 2026 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Segunda consulta: sale del cache, CERO fetch.
    const r2 = await lookupIsbn(db as never, '9789945000012', fetchMock as never);
    expect(r2.source).toBe('cache');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ISBN con fallo de RED: NO cachea el negativo — el retry vuelve a consultar', async () => {
    const failing = vi.fn(async () => { throw new Error('network down'); });
    const r1 = await lookupIsbn(db as never, '9789945000036', failing as never);
    expect(r1.found).toBe(false);
    expect(failing).toHaveBeenCalledTimes(2); // OL + GB, ambos fallaron
    // Retry con red sana: vuelve a salir (no quedó envenenado) y encuentra.
    const okBody = { 'ISBN:9789945000036': { title: 'Retry OK', authors: [{ name: 'A' }] } };
    const okFetch = vi.fn(async () => new Response(JSON.stringify(okBody), { status: 200 }));
    const r2 = await lookupIsbn(db as never, '9789945000036', okFetch as never);
    expect(r2.found).toBe(true);
    expect(okFetch).toHaveBeenCalledTimes(1);
    await db.deleteFrom('biblio_isbn_cache').where('isbn', '=', '9789945000036').execute();
  });

  it('ISBN no encontrado: se cachea el negativo (no re-consulta afuera)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    const r1 = await lookupIsbn(db as never, '9789945000029', fetchMock as never);
    expect(r1.found).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2); // OpenLibrary + fallback Google
    const r2 = await lookupIsbn(db as never, '9789945000029', fetchMock as never);
    expect(r2.found).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2); // negativo cacheado
  });
});
