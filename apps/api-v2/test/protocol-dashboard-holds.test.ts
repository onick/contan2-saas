// apps/api-v2/test/protocol-dashboard-holds.test.ts · integración (skip sin DATABASE_URL).
// "Última asistencia" / "eventos último año" del dashboard de Protocolo solo cuentan
// CHECK-INS: una reserva (hold, checked_in_at NULL) de un invitado no es asistencia.

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { protocolDashboard } from '../src/services/protocol-dashboard.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('protocolDashboard · reservas no son asistencias', () => {
  let db: Kysely<Database>;
  const stamp = Date.now();
  let orgId: string; let uId: string; let uHoldOnly: string;
  const DAY = 86_400_000;

  const mkActivity = async (name: string, ago: number) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id, organization_id: orgId, name, type: 'concierto', location: 'Sala',
      date: new Date(Date.now() - ago * DAY).toISOString(), capacity: 50, enrolled_count: 0, status: 'finalizada',
    } as never).execute();
    return id;
  };
  const mkGuest = async (n: string) => {
    const id = randomUUID();
    await db.insertInto('users').values({
      id, organization_id: orgId, code: `PD-${n}${stamp}`.slice(0, 14), first_name: 'G', last_name: n, email: null, phone: null, visit_count: 0,
    } as never).execute();
    await db.insertInto('protocol_profiles').values({ organization_id: orgId, user_id: id, category: 'autoridad', active: true } as never).execute();
    return id;
  };
  const att = async (activityId: string, userId: string, checkedIn: boolean) =>
    db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, activity_id: activityId, activity_name: 'x', user_id: userId,
      user_code: null, anonymous: false, companions_children: 0, checked_in_at: checkedIn ? new Date().toISOString() : null,
    } as never).execute();

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug: `pdh-${stamp}`, name: 'PDH', status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
    uId = await mkGuest('A'); uHoldOnly = await mkGuest('B');
    const old = await mkActivity('Vieja (check-in)', 20);
    const recentHold = await mkActivity('Reciente (solo reserva)', 2);
    await att(old, uId, true);
    await att(recentHold, uId, false);       // hold más reciente: NO debe ser "última asistencia"
    await att(recentHold, uHoldOnly, false); // solo reservas: 0 eventos
  });

  afterAll(async () => {
    await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('protocol_profiles').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('última asistencia y eventos del último año ignoran las reservas', async () => {
    const d = await protocolDashboard(db, orgId);
    const a = d.guests.find((g) => g.userId === uId)!;
    expect(a.lastActivityName).toBe('Vieja (check-in)');
    expect(a.eventsLastYear).toBe(1);
    const b = d.guests.find((g) => g.userId === uHoldOnly)!;
    expect(b.lastAttendanceAt).toBeNull();
    expect(b.eventsLastYear).toBe(0);
  });
});
