// apps/api-v2/test/audit-log.test.ts · integration (skip sin DATABASE_URL).
// F5 Historial · GET /org/audit: lectura paginada (keyset) del log de auditoría,
// filtros (acción/actor/targetType/fechas), roles (owner/admin sí, operator 403),
// 401/cross-tenant, aislamiento por tenant, y SANITIZACIÓN (sin ip_hash ni ua).

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('GET /org/audit', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `aud-a-${stamp}`;
  const slugB = `aud-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { owner: `aud-own-${stamp}`, admin: `aud-adm-${stamp}`, operator: `aud-ope-${stamp}`, b: `aud-b-${stamp}` };

  const mkOrg = async (slug: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    return s.id;
  };
  const mkAudit = async (orgId: string, action: string, opts: { actorEmail?: string; targetType?: string; createdAt?: string; metadata?: Record<string, unknown> } = {}) =>
    db.insertInto('tenant_audit_log').values({
      organization_id: orgId, actor_staff_id: null,
      actor_email_masked: opts.actorEmail ?? 'a***@t.local', actor_role: 'admin',
      action, target_type: opts.targetType ?? 'user', target_id: 't1', target_label: null,
      metadata: JSON.stringify(opts.metadata ?? { k: 'v' }),
      ip_hash: 'SECRET_IP_HASH_NO_DEBE_SALIR', ua: 'SECRET_UA_NO_DEBE_SALIR',
      ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
    }).execute();

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');

    // Orden de inserción = orden temporal; el endpoint devuelve id desc (más reciente primero).
    await mkAudit(orgAId, 'user.updated', { actorEmail: 'm***@ccb.do', targetType: 'user', createdAt: '2026-03-10T10:00:00.000Z' });
    await mkAudit(orgAId, 'checkin.manual', { actorEmail: 'o***@ccb.do', targetType: 'activity', createdAt: '2026-03-15T10:00:00.000Z' });
    await mkAudit(orgAId, 'report.generated', { actorEmail: 'm***@ccb.do', targetType: 'report', createdAt: '2026-03-20T10:00:00.000Z', metadata: { report: 'attendance-by-activity', rows: 3 } });
    await mkAudit(orgBId, 'user.updated'); // tenant B → NO debe verse

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

  const get = (qs: string, token?: string, host = hostA) =>
    app.inject({ method: 'GET', url: `/api/v2/org/audit${qs}`, headers: { host, ...(token ? { cookie: `contan2_session=${token}` } : {}) } });

  it('admin → 200, eventos del tenant (recientes primero) con categoría derivada, aislado de B', async () => {
    const res = await get('', TOK.admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(3); // sólo tenant A
    expect(body.items.map((e: { action: string }) => e.action)).toEqual(['report.generated', 'checkin.manual', 'user.updated']);
    expect(body.items[0].category).toBe('reporte');
    expect(body.items[1].category).toBe('checkin');
  });

  it('SANITIZACIÓN: la respuesta NUNCA expone ip_hash ni ua', async () => {
    const res = await get('', TOK.admin);
    expect(res.body).not.toContain('SECRET_IP_HASH_NO_DEBE_SALIR');
    expect(res.body).not.toContain('SECRET_UA_NO_DEBE_SALIR');
    const item = res.json().items[0];
    expect(Object.keys(item).join(',')).not.toMatch(/ip|ua|hash/i);
  });

  it('operator → 403; sin sesión → 401; cross-tenant (admin B en host A) → 403', async () => {
    expect((await get('', TOK.operator)).statusCode).toBe(403);
    expect((await get('')).statusCode).toBe(401);
    expect((await get('', TOK.b)).statusCode).toBe(403);
  });

  it('filtros: acción exacta, actor (substring) y rango de fechas', async () => {
    expect((await get('?action=checkin.manual', TOK.admin)).json().items).toHaveLength(1);
    expect((await get('?actor=m***', TOK.admin)).json().items).toHaveLength(2); // user.updated + report.generated
    const ranged = (await get('?from=2026-03-14&to=2026-03-16', TOK.admin)).json();
    expect(ranged.items).toHaveLength(1);
    expect(ranged.items[0].action).toBe('checkin.manual');
  });

  it('paginación keyset: limit + nextCursor', async () => {
    const p1 = (await get('?limit=2', TOK.admin)).json();
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = (await get(`?limit=2&cursor=${p1.nextCursor}`, TOK.admin)).json();
    expect(p2.items).toHaveLength(1); // queda 1
    expect(p2.nextCursor).toBeNull();
    expect(p2.items[0].action).toBe('user.updated'); // el más viejo
  });
});
