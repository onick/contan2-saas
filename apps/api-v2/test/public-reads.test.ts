// apps/api-v2/test/public-reads.test.ts · integration (skip sin DATABASE_URL).
// Slice PÚBLICO read-only del kiosko: /public/activities y /public/users/lookup.
// Clave: SIN cookie de staff (tenant por host). Verifica visibilidad (activa +
// cupo), aislamiento por tenant, anti-leak de PII en el lookup, errores de
// tenant (404/503) y el rate-limit del lookup.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1'; // IP por request → presupuesto de rate-limit aislado por test

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import {
  PublicActivitiesResponseSchema,
  PublicBrandingResponseSchema,
  PublicVisitorLookupResponseSchema,
  PublicVisitorSuggestResponseSchema,
} from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('slice público read-only (kiosko)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `pub-a-${stamp}`;
  const slugB = `pub-b-${stamp}`;
  const slugS = `pub-s-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  const hostS = `${slugS}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  let orgSId: string;

  const codeU1 = 'CCB-PUB001';
  const emailU1 = 'visitante.pub@ccb.do';

  const mkOrg = async (slug: string, status: 'active' | 'suspended', codePrefix?: string) => {
    const o = await db.insertInto('organizations').values({
      slug, name: `Org ${slug}`, status,
      ...(codePrefix ? { code_prefix: codePrefix } : {}),
    }).returning('id').executeTakeFirstOrThrow();
    return o.id;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA, 'active', 'CCB'); // prefijo CCB para el código corto
    orgBId = await mkOrg(slugB, 'active');
    orgSId = await mkOrg(slugS, 'suspended');

    // Visitante de orgA (con email y PII real que NO debe filtrarse).
    await db.insertInto('users').values({
      id: randomUUID(), organization_id: orgAId, code: codeU1,
      first_name: 'Carmen', last_name: 'Objío', email: emailU1, phone: '809-555-0001', visit_count: 3,
    }).execute();
    // Visitante de orgB (aislamiento: no debe verse desde host A).
    await db.insertInto('users').values({
      id: randomUUID(), organization_id: orgBId, code: 'MEM-PUB002',
      first_name: 'Ajeno', last_name: 'Tenant', email: 'ajeno@b.do', phone: null, visit_count: 9,
    }).execute();
    // Homónimas de orgA (lookup por nombre → matches para elegir).
    await db.insertInto('users').values([
      { id: randomUUID(), organization_id: orgAId, code: 'CCB-ANA001', first_name: 'Ana', last_name: 'Pérez', email: null, phone: null, visit_count: 5 },
      { id: randomUUID(), organization_id: orgAId, code: 'CCB-MAR001', first_name: 'Marcelino', last_name: 'Francisco M.', email: null, phone: null, visit_count: 2 },
      { id: randomUUID(), organization_id: orgAId, code: 'CCB-ANA002', first_name: 'Ana', last_name: 'Pérez', email: null, phone: null, visit_count: 1 },
    ]).execute();

    const now = new Date().toISOString();
    // Las activas llevan fecha/cierre FUTUROS: el job global de auto-finalize (otros archivos) no debe poder cerrarlas.
    const future = new Date(Date.now() + 24 * 3_600_000).toISOString();
    await db.insertInto('activities').values([
      // Visible: activa + con cupo + póster.
      { id: randomUUID(), organization_id: orgAId, name: 'Cine Foro Visible', type: 'Cine', category: 'Cine', location: 'Sala 1', date: future, end_date: future, capacity: 100, enrolled_count: 10, image_url: '/uploads/cine.jpg', status: 'activa' },
      // Oculta: activa pero SIN cupo (enrolled == capacity).
      { id: randomUUID(), organization_id: orgAId, name: 'Concierto Lleno', type: 'Concierto', location: 'Sala 2', date: future, end_date: future, capacity: 5, enrolled_count: 5, status: 'activa' },
      // Oculta: finalizada.
      { id: randomUUID(), organization_id: orgAId, name: 'Taller Pasado', type: 'Taller', location: 'Sala 3', date: now, capacity: 50, enrolled_count: 1, status: 'finalizada' },
      // De orgB (aislamiento): no debe verse desde host A.
      { id: randomUUID(), organization_id: orgBId, name: 'Ajena Visible', type: 'Cine', location: 'Sala X', date: future, end_date: future, capacity: 80, enrolled_count: 0, status: 'activa' },
    ]).execute();

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId, orgSId]) {
      if (!id) continue;
      await db.deleteFrom('attendance').where('organization_id', '=', id).execute();
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('users').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  // Público: SIN cookie (la diferencia clave con los endpoints de staff).
  let ipSeq = 0;
  const get = (url: string, host: string, ip?: string) =>
    app.inject({ method: 'GET', url, headers: { host, 'x-forwarded-for': ip ?? `10.4.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}` } });

  it('GET /public/activities (sin cookie) → 200; solo activa + con cupo; aislamiento', async () => {
    const res = await get('/api/v2/public/activities', hostA);
    expect(res.statusCode).toBe(200); // público: no exige auth
    const body = PublicActivitiesResponseSchema.parse(res.json());
    expect(body.total).toBe(1);
    const a = body.activities[0]!;
    expect(a.name).toBe('Cine Foro Visible');
    expect(a.enrolledCount).toBe(10);
    expect(a.capacity).toBe(100);
    expect(a.imageUrl).toBe('/uploads/cine.jpg');
    expect(() => new Date(a.date).toISOString()).not.toThrow(); // date es ISO
    // No incluye la llena, ni la finalizada, ni la de orgB.
    const names = body.activities.map((x) => x.name);
    expect(names).not.toContain('Concierto Lleno');
    expect(names).not.toContain('Taller Pasado');
    expect(names).not.toContain('Ajena Visible');
  });

  it('GET /public/branding (sin cookie) → 200; nombre, logos (horizontal+vertical) y colores', async () => {
    await db.updateTable('organizations')
      .set({ logo_url: '/uploads/h.png', credential_logo_url: '/uploads/v.png', primary_color: '#123456', secondary_color: '#abcdef' })
      .where('id', '=', orgAId).execute();
    const res = await get('/api/v2/public/branding', hostA);
    expect(res.statusCode).toBe(200);
    const body = PublicBrandingResponseSchema.parse(res.json());
    expect(body.organization).toEqual({
      name: `Org ${slugA}`, logoUrl: '/uploads/h.png', verticalLogoUrl: '/uploads/v.png',
      primaryColor: '#123456', secondaryColor: '#abcdef',
    });
    // shape exacto (sin claves de más / sin PII)
    expect(Object.keys(res.json().organization).sort()).toEqual([
      'logoUrl', 'name', 'primaryColor', 'secondaryColor', 'verticalLogoUrl',
    ]);
  });

  it('GET /public/branding: no-tenant → 404; suspendida → 503', async () => {
    expect((await get('/api/v2/public/branding', 'admin.contan2.com')).statusCode).toBe(404);
    expect((await get('/api/v2/public/branding', hostS)).statusCode).toBe(503);
  });

  it('GET /public/users/lookup?q=CODE → 200 + shape mínimo SIN PII', async () => {
    const res = await get(`/api/v2/public/users/lookup?q=${codeU1}`, hostA);
    expect(res.statusCode).toBe(200);
    const body = PublicVisitorLookupResponseSchema.parse(res.json());
    expect(body.visitor).toEqual({ firstName: 'Carmen', lastName: 'Objío', code: codeU1, visitCount: 3 });
    // Anti-leak: el JSON en el cable NO trae email/phone/id ni claves extra.
    const raw = res.json().visitor as Record<string, unknown>;
    expect(raw.email).toBeUndefined();
    expect(raw.phone).toBeUndefined();
    expect(raw.id).toBeUndefined();
    expect(Object.keys(raw).sort()).toEqual(['code', 'firstName', 'lastName', 'visitCount']);
  });

  it('lookup por email → 200; código completo en minúscula se normaliza → 200', async () => {
    expect((await get(`/api/v2/public/users/lookup?q=${emailU1}`, hostA)).statusCode).toBe(200);
    expect((await get(`/api/v2/public/users/lookup?q=${codeU1.toLowerCase()}`, hostA)).statusCode).toBe(200);
  });

  it('lookup por código CORTO (6 chars) → antepone code_prefix del tenant → 200', async () => {
    // 'PUB001' (sin prefijo) → CCB-PUB001 (prefijo del tenant). Y minúscula normaliza.
    expect((await get('/api/v2/public/users/lookup?q=PUB001', hostA)).statusCode).toBe(200);
    const res = await get('/api/v2/public/users/lookup?q=pub001', hostA);
    expect(res.statusCode).toBe(200);
    const out = PublicVisitorLookupResponseSchema.parse(res.json());
    expect('visitor' in out ? out.visitor.code : null).toBe(codeU1);
  });

  it('lookup: desconocido → 404; malformado → 400; sin q → 400', async () => {
    expect((await get('/api/v2/public/users/lookup?q=CCB-ZZZ999', hostA)).statusCode).toBe(404);
    expect((await get('/api/v2/public/users/lookup?q=no-es-codigo', hostA)).statusCode).toBe(400);
    expect((await get('/api/v2/public/users/lookup', hostA)).statusCode).toBe(400);
  });

  it('lookup: visitante de orgB NO se encuentra desde host A (aislamiento)', async () => {
    expect((await get('/api/v2/public/users/lookup?q=MEM-PUB002', hostA)).statusCode).toBe(404);
  });

  it('lookup por NOMBRE: prefijos de palabra, case/acentos-insensible → 200 { visitor }', async () => {
    const res = await get(`/api/v2/public/users/lookup?q=${encodeURIComponent('carmen objio')}`, hostA); // sin acento
    expect(res.statusCode).toBe(200);
    const out = PublicVisitorLookupResponseSchema.parse(res.json());
    // 6.21: por nombre NO sale el code; llega pista + id opaco.
    const v = 'visitor' in out ? out.visitor : null;
    expect(v?.code).toBeUndefined();
    expect(v?.codeHint).toMatch(/^•••/);
    expect(v?.suggestionId).toMatch(/^sg1\./);
    expect(res.body).not.toContain(codeU1);
  });

  it('nombre con apellido ABREVIADO/compuesto: "marcelino francisco" encuentra a "Marcelino Francisco M." (bug 2026-06-11)', async () => {
    const res = await get(`/api/v2/public/users/lookup?q=${encodeURIComponent('marcelino francisco')}`, hostA);
    expect(res.statusCode).toBe(200);
    const out = PublicVisitorLookupResponseSchema.parse(res.json());
    expect('visitor' in out ? out.visitor.code : 'x').toBeUndefined(); // 6.21: sin code
    expect(res.body).not.toContain('CCB-MAR001');
    // prefijos también valen: "marc fran" lo encuentra; el orden de palabras no importa
    const pre = await get(`/api/v2/public/users/lookup?q=${encodeURIComponent('fran marcelino')}`, hostA);
    expect('visitor' in PublicVisitorLookupResponseSchema.parse(pre.json()) ? true : false).toBe(true);
    // pero palabras que NO son prefijo de ninguna palabra del nombre → 404
    expect((await get(`/api/v2/public/users/lookup?q=${encodeURIComponent('marcelino gomez')}`, hostA)).statusCode).toBe(404);
  });

  it('nombre: UNA sola palabra → 400 (anti-enumeración: exige nombre y apellido)', async () => {
    // OJO: una palabra de EXACTAMENTE 6 alfanuméricos (p. ej. "Carmen") se trata
    // como código corto (precedencia del contrato) → 404. Una palabra no-código:
    expect((await get('/api/v2/public/users/lookup?q=Carmencita', hostA)).statusCode).toBe(400);
  });

  // ── suggest (typeahead del kiosko): a diferencia del lookup, sugiere por
  //    PREFIJO de nombre (una sola palabra basta) o de email, en lista. ────────
  it('suggest por NOMBRE (una sola palabra) → lista por prefijo, ordenada por visitas, SIN PII', async () => {
    const res = await get('/api/v2/public/users/suggest?q=ana', hostA);
    expect(res.statusCode).toBe(200);
    const out = PublicVisitorSuggestResponseSchema.parse(res.json());
    const hints = out.suggestions.map((s) => s.codeHint);
    expect(hints).toContain('•••001');
    expect(hints).toContain('•••002');
    // ordenadas por visitas desc: ANA001 (5) antes que ANA002 (1)
    expect(out.suggestions[0]!.codeHint).toBe('•••001');
    // KIO-03: nombre abreviado, jamás el code completo ni el apellido entero
    expect(out.suggestions[0]!.lastName).toBe('P.');
    expect(res.body).not.toContain('CCB-ANA');
    expect(res.body).not.toContain('Pérez');
    expect(res.body).not.toContain('"code"');
    // anti-leak PII: shape mínimo, sin email/teléfono en el body
    expect(res.body).not.toContain('@');
    expect(res.body).not.toContain('phone');
    expect(res.body).not.toContain('809-555');
  });

  it('suggest por EMAIL (prefijo, con @) → encuentra al visitante; aislamiento por tenant', async () => {
    const res = await get(`/api/v2/public/users/suggest?q=${encodeURIComponent('visitante.pub@')}`, hostA);
    expect(res.statusCode).toBe(200);
    const out = PublicVisitorSuggestResponseSchema.parse(res.json());
    expect(out.suggestions.some((s) => s.codeHint === '•••001' && s.firstName === 'Carmen')).toBe(true);
    // el email de orgB no debe verse desde host A
    const cross = PublicVisitorSuggestResponseSchema.parse((await get(`/api/v2/public/users/suggest?q=${encodeURIComponent('ajeno@b.do')}`, hostA)).json());
    expect(cross.suggestions).toHaveLength(0);
  });

  it('suggest: umbral < 3 chars → lista vacía; nombre inexistente → lista vacía (silencioso, no 404)', async () => {
    expect(PublicVisitorSuggestResponseSchema.parse((await get('/api/v2/public/users/suggest?q=an', hostA)).json()).suggestions).toHaveLength(0);
    const none = await get('/api/v2/public/users/suggest?q=zzzxxx', hostA);
    expect(none.statusCode).toBe(200);
    expect(PublicVisitorSuggestResponseSchema.parse(none.json()).suggestions).toHaveLength(0);
  });

  it('suggest por TELÉFONO: prefijo de dígitos normalizados (con o sin separadores); <4 dígitos → vacía', async () => {
    // '809-555-0001' de Carmen: prefijo con separadores y sin ellos.
    for (const q of ['8095550', '809-555', '(809) 555']) {
      const out = PublicVisitorSuggestResponseSchema.parse((await get(`/api/v2/public/users/suggest?q=${encodeURIComponent(q)}`, hostA)).json());
      expect(out.suggestions.some((s) => s.codeHint === '•••001' && s.firstName === 'Carmen')).toBe(true);
      // anti-leak: el body jamás incluye el teléfono
    }
    const short = PublicVisitorSuggestResponseSchema.parse((await get('/api/v2/public/users/suggest?q=809', hostA)).json());
    expect(short.suggestions).toHaveLength(0);
  });

  // ── KIO-03: el id opaco de sugerencia permite el check-in sin exponer el code ──
  const suggestFor = async (q: string, host = hostA) =>
    PublicVisitorSuggestResponseSchema.parse((await get(`/api/v2/public/users/suggest?q=${encodeURIComponent(q)}`, host)).json()).suggestions;
  const postCheckin = (body: unknown, host = hostA) =>
    app.inject({ method: 'POST', url: '/api/v2/public/checkin', headers: { host, 'x-forwarded-for': `10.9.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}` }, payload: body as object });
  const visibleActivity = async () =>
    (await db.selectFrom('activities').select('id').where('organization_id', '=', orgAId).where('name', '=', 'Cine Foro Visible').executeTakeFirstOrThrow()).id;

  it('suggestionId permite el check-in y resuelve al code real en el servidor', async () => {
    const [ana] = await suggestFor('ana');
    expect(ana!.suggestionId).toMatch(/^sg1\./);
    expect(ana!.suggestionId).not.toContain('ANA001');
    const res = await postCheckin({ activityId: await visibleActivity(), visitor: { suggestionId: ana!.suggestionId } });
    expect(res.statusCode).toBe(200);
    // 6.21: por sugerencia de nombre el servidor NO devuelve el code (la confirmación va sin QR).
    expect(res.json().code).toBeUndefined();
    expect(res.json().codeHint).toBe('•••001');
    expect(res.body).not.toContain('CCB-ANA001');
  });

  it('suggestionId inventado o adulterado → 410, sin check-in', async () => {
    const act = await visibleActivity();
    expect((await postCheckin({ activityId: act, visitor: { suggestionId: 'sg1.inventado' } })).statusCode).toBe(410);
    expect((await postCheckin({ activityId: act, visitor: { suggestionId: 'CCB-ANA001' } })).statusCode).toBe(410);
    const [ana] = await suggestFor('ana');
    const tampered = ana!.suggestionId.slice(0, -2) + (ana!.suggestionId.endsWith('A') ? 'BB' : 'AA');
    expect((await postCheckin({ activityId: act, visitor: { suggestionId: tampered } })).statusCode).toBe(410);
  });

  it('suggestionId vencido (> 2 min) → 410', async () => {
    const { sealSuggestion } = await import('../src/services/kiosk-suggestion.js');
    const old = sealSuggestion(orgAId, 'CCB-ANA001', Date.now() - 3 * 60_000);
    expect((await postCheckin({ activityId: await visibleActivity(), visitor: { suggestionId: old } })).statusCode).toBe(410);
  });

  it('suggestionId de OTRA organización → 410', async () => {
    const { sealSuggestion } = await import('../src/services/kiosk-suggestion.js');
    const foreign = sealSuggestion(orgBId, 'MEM-PUB002');
    expect((await postCheckin({ activityId: await visibleActivity(), visitor: { suggestionId: foreign } })).statusCode).toBe(410);
  });

  it('check-in por code sigue funcionando (kioskos viejos / código tecleado)', async () => {
    const res = await postCheckin({ activityId: await visibleActivity(), visitor: { code: 'CCB-ANA002' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().code).toBe('CCB-ANA002'); // identificado por código → el QR sí se muestra
  });

  it('lookup por TELÉFONO exacto (normalizado, tolera 1 de país) → { visitor }; no-match → 404; incompleto → 400', async () => {
    for (const q of ['809-555-0001', '8095550001', '1-809-555-0001', '(809) 555.0001']) {
      const res = await get(`/api/v2/public/users/lookup?q=${encodeURIComponent(q)}`, hostA);
      expect(res.statusCode).toBe(200);
      const out = PublicVisitorLookupResponseSchema.parse(res.json());
      expect('visitor' in out ? out.visitor.code : 'x').toBeUndefined(); // 6.21: sin code
      expect('visitor' in out ? out.visitor.suggestionId : null).toMatch(/^sg1\./);
      expect(res.body).not.toContain(codeU1);
      expect(res.body).not.toContain('809-555'); // shape mínimo sin PII
    }
    expect((await get(`/api/v2/public/users/lookup?q=${encodeURIComponent('809-555-9999')}`, hostA)).statusCode).toBe(404);
    // Teléfono a medias (7 chars con separador, <7 dígitos) → 400 con guía.
    expect((await get(`/api/v2/public/users/lookup?q=${encodeURIComponent('809-555')}`, hostA)).statusCode).toBe(400);
  });

  it('nombre con HOMÓNIMOS → 200 { matches } ordenados por visitas', async () => {
    const res = await get(`/api/v2/public/users/lookup?q=${encodeURIComponent('ana perez')}`, hostA);
    expect(res.statusCode).toBe(200);
    const out = PublicVisitorLookupResponseSchema.parse(res.json());
    // 6.21: los homónimos NO exponen su code (ni el del otro): solo pista + id opaco.
    const ms = 'matches' in out ? out.matches : [];
    expect(ms).toHaveLength(2);
    expect(ms.every((m) => m.code === undefined && /^sg1\./.test(m.suggestionId ?? ''))).toBe(true);
    expect(res.body).not.toContain('CCB-ANA001');
    expect(res.body).not.toContain('CCB-ANA002');
  });

  it('nombre de visitante de OTRO tenant → 404 (aislamiento)', async () => {
    expect((await get(`/api/v2/public/users/lookup?q=${encodeURIComponent('ajeno tenant')}`, hostA)).statusCode).toBe(404);
  });

  it('tenant por host: no-tenant (admin) → 404; org suspendida → 503', async () => {
    expect((await get('/api/v2/public/activities', 'admin.contan2.com')).statusCode).toBe(404);
    expect((await get('/api/v2/public/activities', hostS)).statusCode).toBe(503);
  });

  it('x-forwarded-host: con TRUST_FORWARDED_HOST=1 resuelve el tenant por el header (detrás de proxy)', async () => {
    vi.stubEnv('TRUST_FORWARDED_HOST', '1');
    try {
      // Host = servicio interno (no-tenant); el host real del tenant va en el header.
      const res = await app.inject({
        method: 'GET',
        url: '/api/v2/public/activities',
        headers: { host: 'api-internal:3001', 'x-forwarded-host': hostA },
      });
      expect(res.statusCode).toBe(200);
      expect(PublicActivitiesResponseSchema.parse(res.json()).total).toBe(1); // la actividad de orgA
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('lookup: rate-limit por IP → 429 al superar el umbral', async () => {
    // Inunda con códigos válidos pero inexistentes (pasan tenant + validación).
    const codes: number[] = [];
    for (let i = 0; i < 35; i += 1) { // umbral 30/min
      codes.push((await get('/api/v2/public/users/lookup?q=CCB-RL0000', hostA, '10.4.99.99')).statusCode);
    }
    expect(codes).toContain(429); // en algún punto corta
  });
});
