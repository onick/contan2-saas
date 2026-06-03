// apps/api-v2/test/scanner-auth.test.ts · integration (skip sin DATABASE_URL).
// Auth del scanner: PIN (bcrypt, contra organizations.staff_pin_hash) → cookie
// firmada → /scanner/me. Cubre PIN ok/incorrecto/malformado, tenant sin PIN,
// gate sin cookie y aislamiento cross-tenant.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.SCANNER_SECRET = 'test-scanner-secret-int';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('scanner auth · PIN → cookie firmada', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `scn-a-${stamp}`;
  const slugB = `scn-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  const hostB = `${slugB}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const PIN = '1234';

  const mkOrg = async (slug: string, pinHash: string | null) => {
    const o = await db.insertInto('organizations').values({
      slug, name: `Org ${slug}`, status: 'active', ...(pinHash ? { staff_pin_hash: pinHash } : {}),
    }).returning('id').executeTakeFirstOrThrow();
    return o.id;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA, bcrypt.hashSync(PIN, 10)); // con PIN
    orgBId = await mkOrg(slugB, null);                     // sin PIN
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const pinReq = (host: string, pin: unknown, ip?: string) =>
    app.inject({ method: 'POST', url: '/api/v2/scanner/pin', headers: { host, 'content-type': 'application/json' }, payload: { pin }, ...(ip ? { remoteAddress: ip } : {}) });
  const cookieOf = (res: { cookies: Array<{ name: string; value: string }> }) =>
    res.cookies.find((c) => c.name === 'scanner_session')?.value;

  it('PIN correcto → 200 + cookie scanner_session', async () => {
    const res = await pinReq(hostA, PIN);
    expect(res.statusCode).toBe(200);
    expect(cookieOf(res)).toBeTruthy();
  });

  it('PIN incorrecto → 401', async () => {
    expect((await pinReq(hostA, '9999')).statusCode).toBe(401);
  });

  it('PIN malformado → 400', async () => {
    expect((await pinReq(hostA, 'abc')).statusCode).toBe(400);
    expect((await pinReq(hostA, '12')).statusCode).toBe(400);
  });

  it('tenant sin PIN configurado → 403', async () => {
    expect((await pinReq(hostB, PIN)).statusCode).toBe(403);
  });

  it('/scanner/me sin cookie → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v2/scanner/me', headers: { host: hostA } });
    expect(res.statusCode).toBe(401);
  });

  it('/scanner/me con cookie válida → 200 + orgSlug', async () => {
    const login = await pinReq(hostA, PIN);
    const cookie = cookieOf(login)!;
    const res = await app.inject({ method: 'GET', url: '/api/v2/scanner/me', headers: { host: hostA }, cookies: { scanner_session: cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().orgSlug).toBe(slugA);
  });

  it('cross-tenant: cookie de A en host B → 401', async () => {
    const login = await pinReq(hostA, PIN);
    const cookie = cookieOf(login)!;
    const res = await app.inject({ method: 'GET', url: '/api/v2/scanner/me', headers: { host: hostB }, cookies: { scanner_session: cookie } });
    expect(res.statusCode).toBe(401);
  });

  it('rate-limit por IP: muchos intentos de PIN → 429 (anti fuerza bruta)', async () => {
    // IP propia (bucket aislado) para no chocar con los demás tests.
    const codes: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      codes.push((await pinReq(hostA, '0000', '10.9.9.9')).statusCode);
    }
    expect(codes).toContain(429); // en algún punto corta (PIN_LIMIT=8/min)
  });
});
