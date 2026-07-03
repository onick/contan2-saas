// apps/api-v2/test/platform-admin.test.ts · KPIs + lista de tenants del panel.
// deriveHealth se testea puro (sin DB). Los endpoints requieren cookie de admin.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDb, type Database } from '@contan2/db';
import type { Kysely } from 'kysely';
import { buildApp } from '../src/server.js';
import { hashStaffPassword } from '../src/services/password.js';
import { deriveHealth } from '../src/routes/platform-admin.js';

describe('deriveHealth · prioridad estado → config → uso', () => {
  const base = { status: 'active', plan: 'free', customDomain: null, customDomainVerified: false, attendances30d: 0, lastActivityAt: null };
  it('suspendido gana sobre todo', () => {
    expect(deriveHealth({ ...base, status: 'suspended', attendances30d: 99 })).toBe('suspendido');
  });
  it('trial_vencido', () => {
    expect(deriveHealth({ ...base, status: 'trial_ended' })).toBe('trial_vencido');
  });
  it('dns_pendiente cuando hay dominio sin verificar', () => {
    expect(deriveHealth({ ...base, customDomain: 'x.com', customDomainVerified: false, attendances30d: 5 })).toBe('dns_pendiente');
  });
  it('operando con asistencias en 30d', () => {
    expect(deriveHealth({ ...base, attendances30d: 3, lastActivityAt: new Date().toISOString() })).toBe('operando');
  });
  it('inactivo si nunca tuvo actividad', () => {
    expect(deriveHealth({ ...base })).toBe('inactivo');
  });
  it('sin_uso si tuvo actividad pero no en 30d', () => {
    expect(deriveHealth({ ...base, attendances30d: 0, lastActivityAt: '2020-01-01T00:00:00Z' })).toBe('sin_uso');
  });
});

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('platform · kpis + tenants (auth)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const email = `pa2-${stamp}@test.local`;
  const password = 'SuperSecret!Platform2';
  let adminId: string;
  let token: string;

  const cookieFrom = (h: unknown): string | null => {
    const arr = Array.isArray(h) ? h : h ? [h] : [];
    for (const c of arr) { const m = /contan2_admin_session=([^;]+)/.exec(String(c)); if (m) return m[1]!; }
    return null;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    adminId = (await db.insertInto('platform_admins').values({
      email, password_hash: await hashStaffPassword(password), full_name: 'PA2', status: 'active',
    }).returning('id').executeTakeFirstOrThrow()).id;
    app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/api/v2/platform/auth/login', headers: { host: 'admin.contan2.com', 'content-type': 'application/json' }, payload: { email, password } });
    token = cookieFrom(res.headers['set-cookie'])!;
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('platform_sessions').where('platform_admin_id', '=', adminId).execute();
    await db.deleteFrom('platform_admins').where('id', '=', adminId).execute();
    await db.destroy();
  });

  const authed = (url: string) => app.inject({ method: 'GET', url, headers: { host: 'admin.contan2.com', cookie: `contan2_admin_session=${token}` } });

  it('kpis: 401 sin cookie, 200 con cookie + shape', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v2/platform/kpis', headers: { host: 'admin.contan2.com' } })).statusCode).toBe(401);
    const res = await authed('/api/v2/platform/kpis');
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.tenants.total).toBeGreaterThanOrEqual(1); // seed: ccb + test-tenant
    expect(typeof j.usersTotal).toBe('number');
    expect(Array.isArray(j.recentAudit)).toBe(true);
  });

  it('tenants: 200 con ccb presente + health válido', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v2/platform/tenants', headers: { host: 'admin.contan2.com' } })).statusCode).toBe(401);
    const res = await authed('/api/v2/platform/tenants');
    expect(res.statusCode).toBe(200);
    const { tenants } = res.json();
    const ccb = tenants.find((t: { slug: string }) => t.slug === 'ccb');
    expect(ccb).toBeTruthy();
    expect(['operando', 'sin_uso', 'inactivo', 'trial_vencido', 'dns_pendiente', 'suspendido']).toContain(ccb.health);

    // búsqueda por slug
    const q = await authed('/api/v2/platform/tenants?q=ccb');
    expect(q.json().tenants.every((t: { slug: string }) => t.slug.includes('ccb') || t.name.toLowerCase().includes('ccb'))).toBe(true);
  });
});
