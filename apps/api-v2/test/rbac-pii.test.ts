// apps/api-v2/test/rbac-pii.test.ts · integration (skip sin DATABASE_URL).
// B9 · RBAC en la API: el confinamiento por rol ya no vive solo en la UI.
//   · POST /checkin y /checkin/anonymous      → owner/admin/operator/puerta
//   · POST /puerta/registrar                  → owner/admin/operator/puerta
//   · GET /users, /users/facets, /users/:code (+/activities, /affinity) con PII
//                                             → owner/admin/operator/consulta/puerta
// protocolo / biblioteca (y consulta en escrituras de puerta) reciben 403 en español.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

const ROLES = ['owner', 'admin', 'operator', 'protocolo', 'consulta', 'puerta', 'biblioteca'] as const;
type Role = (typeof ROLES)[number];

const DOOR_WRITE: ReadonlySet<Role> = new Set(['owner', 'admin', 'operator', 'puerta']);
const PADRON_READ: ReadonlySet<Role> = new Set(['owner', 'admin', 'operator', 'consulta', 'puerta']);

run('RBAC en la API · check-in / padrón / puerta', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `rbacpii-${stamp}`;
  const host = `${slug}.contan2.com`;
  let orgId: string;
  let userCode: string;
  const tok = (r: Role) => `rbacpii-${r}-${stamp}`;
  let ipSeq = 0;

  const call = (method: 'GET' | 'POST', url: string, role: Role, body?: unknown) =>
    app.inject({
      method, url,
      headers: {
        host, cookie: `contan2_session=${tok(role)}`,
        'x-forwarded-for': `10.9.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`,
        ...(method === 'POST' ? { 'content-type': 'application/json', 'idempotency-key': `k-${randomUUID()}` } : {}),
      },
      ...(method === 'POST' ? { payload: (body ?? {}) as object } : {}),
    });

  beforeAll(async () => {
    process.env.TRUST_PROXY = '1';
    db = createDb(DATABASE_URL);
    orgId = (await db.insertInto('organizations').values({ slug, name: 'RBAC PII', status: 'active' })
      .returning('id').executeTakeFirstOrThrow()).id;
    for (const role of ROLES) {
      const st = await db.insertInto('staff_members').values({
        organization_id: orgId, email: `${role}-${stamp}@t.local`, password_hash: 'x',
        full_name: `S ${role}`, status: 'active', role,
      } as never).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({
        staff_member_id: st.id, token_hash: hashToken(tok(role)),
        expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
      }).execute();
    }
    userCode = `CCB-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
    await db.insertInto('users').values({
      id: randomUUID(), organization_id: orgId, code: userCode, first_name: 'Pii', last_name: 'Persona',
      email: `pii-${stamp}@t.local`, phone: null, visit_count: 0,
    } as never).execute();
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (orgId) {
      await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
        db.selectFrom('staff_members').select('id').where('organization_id', '=', orgId)).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    }
    await db.destroy();
  });

  // El chequeo de rol corre ANTES de validar el body: un rol permitido con body
  // vacío llega al 400 de validación (nunca 403); uno no permitido recibe 403.
  const expectGate = async (
    method: 'GET' | 'POST', url: string, allowed: ReadonlySet<Role>,
  ) => {
    for (const role of ROLES) {
      const res = await call(method, url, role);
      if (allowed.has(role)) {
        expect(res.statusCode, `${method} ${url} como ${role}`).not.toBe(403);
        expect(res.statusCode, `${method} ${url} como ${role}`).not.toBe(401);
      } else {
        expect(res.statusCode, `${method} ${url} como ${role}`).toBe(403);
        expect((res.json() as { error: string }).error).toMatch(/^No tienes permiso/);
      }
    }
  };

  it('POST /checkin → owner/admin/operator/puerta; protocolo/consulta/biblioteca 403', async () => {
    await expectGate('POST', '/api/v2/checkin', DOOR_WRITE);
  });

  it('POST /checkin/anonymous → owner/admin/operator/puerta; el resto 403', async () => {
    await expectGate('POST', '/api/v2/checkin/anonymous', DOOR_WRITE);
  });

  it('POST /puerta/registrar → owner/admin/operator/puerta; el resto 403', async () => {
    await expectGate('POST', '/api/v2/puerta/registrar', DOOR_WRITE);
  });

  it('GET /users (padrón con PII) → owner/admin/operator/consulta/puerta; protocolo/biblioteca 403', async () => {
    await expectGate('GET', '/api/v2/users', PADRON_READ);
  });

  it('GET /users/facets, /users/:code y sus sub-lecturas con el mismo conjunto', async () => {
    await expectGate('GET', '/api/v2/users/facets', PADRON_READ);
    await expectGate('GET', `/api/v2/users/${userCode}`, PADRON_READ);
    await expectGate('GET', `/api/v2/users/${userCode}/activities`, PADRON_READ);
    await expectGate('GET', `/api/v2/users/${userCode}/affinity`, PADRON_READ);
  });

  it('el 403 no filtra datos del padrón', async () => {
    const res = await call('GET', '/api/v2/users', 'protocolo');
    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.json())).not.toContain('Persona');
  });

  it('las lecturas que Protocolo necesita siguen abiertas (visitors/activities de check-in)', async () => {
    expect((await call('GET', '/api/v2/checkin/visitors?q=Pii', 'protocolo')).statusCode).toBe(200);
    expect((await call('GET', '/api/v2/checkin/activities', 'protocolo')).statusCode).toBe(200);
  });
});
