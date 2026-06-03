// apps/api-v2/test/trust-proxy.test.ts · trustProxy + rate-limit por IP real.
// Unit (siempre) de resolveTrustProxy + integración (skip sin DATABASE_URL) que
// prueba, sobre el rate-limit del scanner PIN, que `req.ip` se deriva del
// X-Forwarded-For (buckets por IP real, no por IP del proxy).

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.SCANNER_SECRET = 'test-trust-proxy-secret';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { buildApp, resolveTrustProxy } from '../src/server.js';

describe('resolveTrustProxy · valor de Fastify trustProxy', () => {
  it('default (unset/empty) → 1 (confía en el proxy inmediato, no spoofeable)', () => {
    expect(resolveTrustProxy({})).toBe(1);
    expect(resolveTrustProxy({ TRUST_PROXY: '' })).toBe(1);
    expect(resolveTrustProxy({ TRUST_PROXY: '   ' })).toBe(1);
  });
  it('número de hops explícito', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: '2' })).toBe(2);
    expect(resolveTrustProxy({ TRUST_PROXY: '0' })).toBe(0);
  });
  it('booleanos explícitos', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: 'true' })).toBe(true);
    expect(resolveTrustProxy({ TRUST_PROXY: 'false' })).toBe(false);
  });
  it('basura → cae al default seguro (1)', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: 'abc' })).toBe(1);
    expect(resolveTrustProxy({ TRUST_PROXY: '-3' })).toBe(1);
  });
});

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('rate-limit del scanner PIN aísla por IP real (X-Forwarded-For)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `tp-${stamp}`;
  const host = `${slug}.contan2.com`;
  let orgId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const o = await db.insertInto('organizations').values({
      slug, name: `Org ${slug}`, status: 'active', staff_pin_hash: bcrypt.hashSync('1234', 10),
    }).returning('id').executeTakeFirstOrThrow();
    orgId = o.id;
    app = buildApp(); // trustProxy default = 1
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (orgId) await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    if (db) await db.destroy();
  });

  // POST con PIN incorrecto; opcionalmente fija X-Forwarded-For o el socket.
  const hit = (opts: { xff?: string; ip?: string }) =>
    app.inject({
      method: 'POST',
      url: '/api/v2/scanner/pin',
      headers: { host, 'content-type': 'application/json', ...(opts.xff ? { 'x-forwarded-for': opts.xff } : {}) },
      payload: { pin: '0000' },
      ...(opts.ip ? { remoteAddress: opts.ip } : {}),
    });

  it('mismo X-Forwarded-For excede el límite → 429', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) codes.push((await hit({ xff: '198.51.100.10' })).statusCode);
    expect(codes).toContain(429); // PIN_LIMIT=8/min por IP
  });

  it('dos X-Forwarded-For distintos → buckets separados (sin 429)', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      codes.push((await hit({ xff: '198.51.100.20' })).statusCode);
      codes.push((await hit({ xff: '198.51.100.21' })).statusCode);
    }
    // 7 por IP (≤8) → ninguno 429. Si compartieran bucket (14 total) habría 429.
    expect(codes).not.toContain(429);
  });

  it('sin X-Forwarded-For usa la IP del socket (rate-limit por esa IP)', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) codes.push((await hit({ ip: '198.51.100.40' })).statusCode);
    expect(codes).toContain(429); // sin XFF, el bucket es la IP del socket
  });
});
