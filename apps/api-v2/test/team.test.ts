// apps/api-v2/test/team.test.ts · integration (skip sin DATABASE_URL).
// F5 Equipo · GET /org/team: lista tenant-scoped de staff_members con SELECCIÓN
// SEGURA (nunca hashes/campos internos), búsqueda, filtros rol/status, paginación,
// roles (owner/admin sí, operator 403), 401/cross-tenant, aislamiento, soft-delete.

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { TeamOverviewResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('GET /org/team', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `team-a-${stamp}`;
  const slugB = `team-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { owner: `team-own-${stamp}`, admin: `team-adm-${stamp}`, operator: `team-ope-${stamp}`, b: `team-b-${stamp}` };

  const mkOrg = async (slug: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, opts: { token?: string; role: 'owner' | 'admin' | 'operator'; status?: 'active' | 'suspended'; name?: string; email?: string; deleted?: boolean; lastLogin?: string }) => {
    const email = opts.email ?? `${opts.role}-${orgId.slice(0, 8)}-${stamp}@t.local`;
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId, email, password_hash: 'SUPERSECRET_HASH', full_name: opts.name ?? `S ${opts.role}`,
      status: opts.status ?? 'active', role: opts.role, mfa_secret: 'SECRET_MFA',
      ...(opts.lastLogin ? { last_login_at: opts.lastLogin } : {}),
      ...(opts.deleted ? { deleted_at: new Date().toISOString() } : {}),
    }).returning('id').executeTakeFirstOrThrow();
    if (opts.token) await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(opts.token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    return s.id;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, { token: TOK.owner, role: 'owner', name: 'Ana Owner', lastLogin: '2026-06-01T10:00:00.000Z' });
    await mkStaff(orgAId, { token: TOK.admin, role: 'admin', name: 'Beto Admin' });
    await mkStaff(orgAId, { token: TOK.operator, role: 'operator', name: 'Caro Operator' }); // activo (sesión resuelve → gate de rol)
    await mkStaff(orgAId, { role: 'admin', name: 'Dani Suspendido', status: 'suspended', email: `dani-susp-${stamp}@t.local` }); // suspendido (para filtro status)
    await mkStaff(orgAId, { role: 'operator', name: 'Borrado Soft', deleted: true }); // soft-deleted → NO debe verse
    await mkStaff(orgBId, { token: TOK.b, role: 'admin', name: 'Otro Tenant' });

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const get = (qs: string, token?: string, host = hostA) =>
    app.inject({ method: 'GET', url: `/api/v2/org/team${qs}`, headers: { host, ...(token ? { cookie: `contan2_session=${token}` } : {}) } });

  it('admin → 200, lista del tenant (sin soft-deleted), aislada de B', async () => {
    const res = await get('', TOK.admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(4); // owner+admin+operator+suspendido; el soft-deleted NO
    expect(body.items.map((m: { fullName: string }) => m.fullName).sort()).toEqual(['Ana Owner', 'Beto Admin', 'Caro Operator', 'Dani Suspendido']);
    expect(body.items.find((m: { role: string }) => m.role === 'owner').lastLoginAt).toBe('2026-06-01T10:00:00.000Z');
  });

  it('SELECCIÓN SEGURA: nunca expone hashes ni campos internos', async () => {
    const res = await get('', TOK.admin);
    expect(res.body).not.toContain('SUPERSECRET_HASH');
    expect(res.body).not.toContain('SECRET_MFA');
    const keys = Object.keys(res.json().items[0]).join(',');
    expect(keys).not.toMatch(/password|hash|mfa|secret|failed|locked|attempt|deleted|must_change/i);
  });

  it('owner también; operator → 403; sin sesión → 401; cross-tenant (admin B en host A) → 403', async () => {
    expect((await get('', TOK.owner)).statusCode).toBe(200);
    expect((await get('', TOK.operator)).statusCode).toBe(403);
    expect((await get('')).statusCode).toBe(401);
    expect((await get('', TOK.b)).statusCode).toBe(403);
  });

  it('búsqueda (nombre/email) y filtros rol/status', async () => {
    expect((await get('?q=Beto', TOK.admin)).json().items).toHaveLength(1);
    expect((await get('?role=operator', TOK.admin)).json().items.map((m: { fullName: string }) => m.fullName)).toEqual(['Caro Operator']);
    expect((await get('?status=suspended', TOK.admin)).json().items.map((m: { fullName: string }) => m.fullName)).toEqual(['Dani Suspendido']);
    expect((await get('?status=active', TOK.admin)).json().items).toHaveLength(3);
  });

  it('paginación por offset + nextCursor', async () => {
    const p1 = (await get('?limit=2', TOK.admin)).json();
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).toBe('2');
    const p2 = (await get('?limit=2&cursor=2', TOK.admin)).json();
    expect(p2.items).toHaveLength(2);
    expect(p2.nextCursor).toBeNull();
  });

  it('overview → KPIs + resumen por rol (5 roles, incl. consulta); operator 403', async () => {
    const ov = (host = hostA, token?: string) =>
      app.inject({ method: 'GET', url: '/api/v2/org/team/overview', headers: { host, ...(token ? { cookie: `contan2_session=${token}` } : {}) } });
    expect((await ov(hostA, TOK.operator)).statusCode).toBe(403);
    const res = await ov(hostA, TOK.admin);
    expect(res.statusCode).toBe(200);
    const d = TeamOverviewResponseSchema.parse(res.json());
    // activos: owner+admin+operator (Dani suspendido y el soft-deleted no cuentan).
    expect(d.kpis.activeMembers).toBe(3);
    expect(d.kpis.admins).toBe(2); // owner + admin (activos)
    expect(d.kpis.pendingInvites).toBe(0);
    // resumen por rol: las 5 categorías, conteo de NO soft-deleted por rol.
    expect(d.roles.map((r) => r.role)).toEqual(['owner', 'admin', 'operator', 'protocolo', 'consulta']);
    const byRole = Object.fromEntries(d.roles.map((r) => [r.role, r.count]));
    expect(byRole).toMatchObject({ owner: 1, admin: 2, operator: 1, protocolo: 0, consulta: 0 });
    expect(d.kpis.activeThisWeekPct).toBeGreaterThanOrEqual(0);
  });
});
