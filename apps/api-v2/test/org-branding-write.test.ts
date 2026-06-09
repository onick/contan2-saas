// apps/api-v2/test/org-branding-write.test.ts · integration (skip sin DATABASE_URL).
// F5 Identidad · PATCH /org/branding: campos permitidos validados, owner/admin
// (operator 403), 401/cross-tenant, sin CSS/HTML arbitrario, auditoría sin PII.

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('PATCH /org/branding', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `br-a-${stamp}`;
  const slugB = `br-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { admin: `br-adm-${stamp}`, operator: `br-ope-${stamp}`, b: `br-b-${stamp}` };

  const mkOrg = async (slug: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST', primary_color: '#e65100', secondary_color: '#ff6f00' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const patch = (body: unknown, token?: string, host = hostA) =>
    app.inject({ method: 'PATCH', url: '/api/v2/org/branding', headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, payload: body as object });

  it('admin actualiza nombre+colores+sidebar → 200, persiste y devuelve lo nuevo', async () => {
    const res = await patch({ name: 'CCB v2', primaryColor: '#f39228', secondaryColor: '#ffb877', sidebarTheme: 'dark' }, TOK.admin);
    expect(res.statusCode).toBe(200);
    const org = res.json().organization;
    expect(org).toMatchObject({ name: 'CCB v2', primaryColor: '#f39228', sidebarTheme: 'dark' });
    const row = await db.selectFrom('organizations').select(['name', 'primary_color', 'sidebar_style']).where('id', '=', orgAId).executeTakeFirstOrThrow();
    expect(row.primary_color).toBe('#f39228');
    expect(row.sidebar_style).toBe('dark');
  });

  it('logoUrl: acepta /uploads y null; rechaza javascript: y campos extra', async () => {
    expect((await patch({ logoUrl: '/uploads/ccb-logo.png' }, TOK.admin)).statusCode).toBe(200);
    expect((await patch({ logoUrl: null }, TOK.admin)).statusCode).toBe(200);
    expect((await patch({ logoUrl: 'javascript:alert(1)' }, TOK.admin)).statusCode).toBe(400);
    expect((await patch({ primaryColor: 'red' }, TOK.admin)).statusCode).toBe(400); // no hex
    expect((await patch({ evil: '<script>' }, TOK.admin)).statusCode).toBe(400); // strict
    expect((await patch({}, TOK.admin)).statusCode).toBe(400); // sin cambios
  });

  it('operator → 403; sin sesión → 401; cross-tenant (admin B en host A) → 403', async () => {
    expect((await patch({ name: 'x' }, TOK.operator)).statusCode).toBe(403);
    expect((await patch({ name: 'x' })).statusCode).toBe(401);
    expect((await patch({ name: 'x' }, TOK.b)).statusCode).toBe(403);
  });

  it('auditoría branding.updated con actor enmascarado y solo nombres de campos', async () => {
    await patch({ name: 'CCB auditado' }, TOK.admin);
    const row = await db.selectFrom('tenant_audit_log').selectAll().where('organization_id', '=', orgAId).where('action', '=', 'branding.updated').orderBy('id', 'desc').executeTakeFirstOrThrow();
    expect(row.actor_email_masked).toMatch(/\*\*\*@/);
    expect(row.target_type).toBe('branding');
    const meta = typeof row.metadata === 'string' ? row.metadata : JSON.stringify(row.metadata);
    expect(meta).toContain('name');
    expect(meta).not.toMatch(/@t\.local/);
  });
});
