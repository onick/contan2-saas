// apps/api-v2/test/pdf-semaphore.test.ts · REP-A27. Semáforo de renders PDF:
// la parte pura simula renders simultáneos (sin Chromium); la parte de ruta
// (skip sin DATABASE_URL) comprueba 503 + Retry-After cuando la cola se llena.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';
import { Semaphore, BusyError } from '../src/services/reports/semaphore.js';
import { setPdfLimiter } from '../src/services/reports/pdf-renderer.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('Semaphore · renders simultáneos simulados', () => {
  it('nunca supera el máximo concurrente y atiende todo en orden de llegada', async () => {
    const sem = new Semaphore({ max: 2, maxQueue: 20, queueTimeoutMs: 5_000 });
    let current = 0;
    let peak = 0;
    const order: number[] = [];
    const render = (i: number) => sem.run(async () => {
      current += 1; peak = Math.max(peak, current); order.push(i);
      await sleep(15);
      current -= 1;
      return i;
    });
    const out = await Promise.all(Array.from({ length: 10 }, (_, i) => render(i)));
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(peak).toBe(2);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sem.running).toBe(0);
    expect(sem.waiting).toBe(0);
  });

  it('cola llena => BusyError inmediato con retryAfter', async () => {
    const sem = new Semaphore({ max: 1, maxQueue: 1, queueTimeoutMs: 5_000, retryAfterSec: 7 });
    let release!: () => void;
    const held = sem.run(() => new Promise<void>((r) => { release = r; })); // ocupa el cupo
    const queued = sem.run(async () => 'ok');                                // 1 en cola
    const rejected = await sem.run(async () => 'x').catch((e: unknown) => e);
    expect(rejected).toBeInstanceOf(BusyError);
    expect((rejected as BusyError).retryAfterSec).toBe(7);
    release();
    await held;
    expect(await queued).toBe('ok');
  });

  it('timeout de espera => BusyError y la tarea no se ejecuta', async () => {
    vi.useFakeTimers();
    try {
      const sem = new Semaphore({ max: 1, maxQueue: 5, queueTimeoutMs: 1_000 });
      const never = new Promise<void>(() => {});
      void sem.run(() => never); // ocupa el cupo para siempre
      const fn = vi.fn(async () => 'x');
      const waiting = sem.run(fn).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1_001);
      expect(await waiting).toBeInstanceOf(BusyError);
      expect(fn).not.toHaveBeenCalled();
      expect(sem.waiting).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un render que falla libera el cupo', async () => {
    const sem = new Semaphore({ max: 1, maxQueue: 5, queueTimeoutMs: 1_000 });
    await expect(sem.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(sem.running).toBe(0);
    expect(await sem.run(async () => 'después')).toBe('después');
  });
});

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('rutas de PDF · 503 con Retry-After cuando el generador está saturado', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const host = `reppdf-${stamp}.contan2.com`;
  const token = `reppdf-tok-${stamp}`;
  let orgId: string;
  let activityId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgId = (await db.insertInto('organizations').values({
      slug: `reppdf-${stamp}`, name: 'Centro PDF', status: 'active',
    } as never).returning('id').executeTakeFirstOrThrow()).id;
    const staff = await db.insertInto('staff_members').values({
      organization_id: orgId, email: `admin-pdf-${stamp}@test.local`, password_hash: 'x',
      full_name: 'S', status: 'active', role: 'admin',
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: staff.id, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
    activityId = randomUUID();
    await db.insertInto('activities').values({
      id: activityId, organization_id: orgId, name: 'Act PDF', type: 'cine', location: 'Sala',
      date: '2026-03-10T20:00:00Z', capacity: 50, enrolled_count: 0, status: 'finalizada',
      description: '', image_url: null, category: null,
    }).execute();
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
      db.selectFrom('staff_members').select('id').where('organization_id', '=', orgId)).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  afterEach(() => setPdfLimiter()); // restaura el semáforo del entorno

  const get = (url: string, ip: number) => app.inject({
    method: 'GET', url,
    headers: { host, 'x-forwarded-for': `10.9.0.${ip}`, cookie: `contan2_session=${token}` },
  });

  it('período y actividad: cola llena => 503 + Retry-After y mensaje en español', async () => {
    const sem = new Semaphore({ max: 1, maxQueue: 0, queueTimeoutMs: 1_000, retryAfterSec: 9 });
    setPdfLimiter(sem);
    let release!: () => void;
    const held = sem.run(() => new Promise<void>((r) => { release = r; })); // el único cupo, ocupado

    const period = await get('/api/v2/reports/period.pdf?from=2026-03-01&to=2026-03-31', 1);
    expect(period.statusCode).toBe(503);
    expect(period.headers['retry-after']).toBe('9');
    expect(period.json().error).toMatch(/ocupado/i);

    const act = await get(`/api/v2/reports/activity/${activityId}.pdf`, 2);
    expect(act.statusCode).toBe(503);
    expect(act.headers['retry-after']).toBe('9');

    release();
    await held;
  });
});
