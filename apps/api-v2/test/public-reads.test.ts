// apps/api-v2/test/public-reads.test.ts · integration (skip sin DATABASE_URL).
// Slice PÚBLICO read-only del kiosko: /public/activities y /public/users/lookup.
// Clave: SIN cookie de staff (tenant por host). Verifica visibilidad (activa +
// cupo), aislamiento por tenant, anti-leak de PII en el lookup, errores de
// tenant (404/503) y el rate-limit del lookup.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1'; // IP por request → presupuesto de rate-limit aislado por test

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import {
  PublicActivitiesResponseSchema,
  PublicVisitorLookupResponseSchema,
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
    await db.insertInto('activities').values([
      // Visible: activa + con cupo + póster.
      { id: randomUUID(), organization_id: orgAId, name: 'Cine Foro Visible', type: 'Cine', category: 'Cine', location: 'Sala 1', date: now, capacity: 100, enrolled_count: 10, image_url: '/uploads/cine.jpg', status: 'activa' },
      // Oculta: activa pero SIN cupo (enrolled == capacity).
      { id: randomUUID(), organization_id: orgAId, name: 'Concierto Lleno', type: 'Concierto', location: 'Sala 2', date: now, capacity: 5, enrolled_count: 5, status: 'activa' },
      // Oculta: finalizada.
      { id: randomUUID(), organization_id: orgAId, name: 'Taller Pasado', type: 'Taller', location: 'Sala 3', date: now, capacity: 50, enrolled_count: 1, status: 'finalizada' },
      // De orgB (aislamiento): no debe verse desde host A.
      { id: randomUUID(), organization_id: orgBId, name: 'Ajena Visible', type: 'Cine', location: 'Sala X', date: now, capacity: 80, enrolled_count: 0, status: 'activa' },
    ]).execute();

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId, orgSId]) {
      if (!id) continue;
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
    expect('visitor' in out ? out.visitor.code : null).toBe(codeU1);
  });

  it('nombre con apellido ABREVIADO/compuesto: "marcelino francisco" encuentra a "Marcelino Francisco M." (bug 2026-06-11)', async () => {
    const res = await get(`/api/v2/public/users/lookup?q=${encodeURIComponent('marcelino francisco')}`, hostA);
    expect(res.statusCode).toBe(200);
    const out = PublicVisitorLookupResponseSchema.parse(res.json());
    expect('visitor' in out ? out.visitor.code : null).toBe('CCB-MAR001');
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

  it('nombre con HOMÓNIMOS → 200 { matches } ordenados por visitas', async () => {
    const res = await get(`/api/v2/public/users/lookup?q=${encodeURIComponent('ana perez')}`, hostA);
    expect(res.statusCode).toBe(200);
    const out = PublicVisitorLookupResponseSchema.parse(res.json());
    expect('matches' in out ? out.matches.map((m) => m.code) : []).toEqual(['CCB-ANA001', 'CCB-ANA002']);
  });

  it('nombre de visitante de OTRO tenant → 404 (aislamiento)', async () => {
    expect((await get(`/api/v2/public/users/lookup?q=${encodeURIComponent('ajeno tenant')}`, hostA)).statusCode).toBe(404);
  });

  it('tenant por host: no-tenant (admin) → 404; org suspendida → 503', async () => {
    expect((await get('/api/v2/public/activities', 'admin.contan2.com')).statusCode).toBe(404);
    expect((await get('/api/v2/public/activities', hostS)).statusCode).toBe(503);
  });

  it('x-forwarded-host: con TRUST_FORWARDED_HOST=1 resuelve el tenant por el header (detrás de proxy)', async () => {
    const prev = process.env.TRUST_FORWARDED_HOST;
    process.env.TRUST_FORWARDED_HOST = '1';
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
      if (prev === undefined) delete process.env.TRUST_FORWARDED_HOST;
      else process.env.TRUST_FORWARDED_HOST = prev;
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
