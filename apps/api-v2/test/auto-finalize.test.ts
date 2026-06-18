// apps/api-v2/test/auto-finalize.test.ts · integration (skip sin DATABASE_URL).
// Auto-finalización por HORA DE CIERRE (end_date), con fallback a la de inicio
// (date). El caso clave: una actividad que YA EMPEZÓ pero cuyo cierre es futuro
// NO debe finalizarse (era el bug: v1 usaba `date` y la cerraba al empezar).

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { finalizePastActivities } from '../src/services/auto-finalize.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('auto-finalize por hora de cierre (end_date)', () => {
  let db: Kysely<Database>;
  const stamp = Date.now();
  let orgId: string;
  const past = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const future = new Date(Date.now() + 3 * 3_600_000).toISOString();

  const mkAct = async (name: string, date: string, endDate: string | null) =>
    (await db.insertInto('activities').values({
      id: randomUUID(), organization_id: orgId, name, type: 'cine', location: 'Sala',
      capacity: 50, enrolled_count: 0, status: 'activa', date, end_date: endDate,
    }).returning('id').executeTakeFirstOrThrow()).id;
  const statusOf = async (id: string) =>
    (await db.selectFrom('activities').select('status').where('id', '=', id).executeTakeFirstOrThrow()).status;

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgId = (await db.insertInto('organizations').values({ slug: `af-${stamp}`, name: 'AF', status: 'active', code_prefix: 'AFX' }).returning('id').executeTakeFirstOrThrow()).id;
  });
  afterAll(async () => {
    await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('EMPEZADA pero cierre futuro → sigue activa (el fix)', async () => {
    const a = await mkAct('en curso', past, future);
    await finalizePastActivities(db);
    expect(await statusOf(a)).toBe('activa');
  });

  it('hora de cierre ya pasó → finalizada', async () => {
    const a = await mkAct('cerrada', past, past);
    await finalizePastActivities(db);
    expect(await statusOf(a)).toBe('finalizada');
  });

  it('sin end_date → cae a la fecha de inicio (date pasada) → finalizada', async () => {
    const a = await mkAct('sin cierre', past, null);
    await finalizePastActivities(db);
    expect(await statusOf(a)).toBe('finalizada');
  });

  it('inicio y cierre futuros → intacta', async () => {
    const a = await mkAct('futura', future, future);
    await finalizePastActivities(db);
    expect(await statusOf(a)).toBe('activa');
  });
});
