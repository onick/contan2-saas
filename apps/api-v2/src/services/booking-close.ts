// apps/api-v2/src/services/booking-close.ts · cierre automático de la agenda de
// la Sala VR (decisión del dueño Q3): las reservas sin check-in pasan a "No vino"
// al cierre del día, y se pueden corregir a mano (no_show → attended por check-in).
//   · closeUnattendedBookings({ date })        → un día concreto (endpoint close-day)
//   · closeUnattendedBookings({ beforeToday }) → todo lo anterior a hoy (barrido horario)
// Idempotente: solo toca scheduled/confirmed sin asistencia; una 2.ª corrida no
// encuentra filas. El barrido global usa el pool elevado (cross-org), igual que
// auto-finalize.

import { sql, type DbClient } from '@contan2/db';
import { REPORT_TZ as TZ } from './timezone.js';

export interface CloseOpts {
  orgId?: string;          // acota a un tenant (endpoint); sin él, todos (job)
  date?: string;           // YYYY-MM-DD en REPORT_TZ
  beforeToday?: boolean;   // días anteriores a hoy en REPORT_TZ
  actor?: { staffId: string; role: string } | null; // null = sistema
}

const localDate = sql<string>`(scheduled_at AT TIME ZONE ${sql.lit(TZ)})::date`;

export async function closeUnattendedBookings(db: DbClient, opts: CloseOpts): Promise<{ id: string; organizationId: string }[]> {
  if (!opts.date && !opts.beforeToday) throw new Error('closeUnattendedBookings: date o beforeToday es obligatorio');
  const nowIso = new Date().toISOString();
  let q = db.updateTable('space_bookings')
    .set({ status: 'no_show', no_show_at: nowIso, updated_at: nowIso })
    .where('status', 'in', ['scheduled', 'confirmed'])
    .where('attendance_id', 'is', null)
    .where(sql<boolean>`scheduled_at < now()`);
  if (opts.orgId) q = q.where('organization_id', '=', opts.orgId);
  if (opts.date) q = q.where(sql<boolean>`${localDate} = ${opts.date}::date`);
  if (opts.beforeToday) q = q.where(sql<boolean>`${localDate} < (now() AT TIME ZONE ${sql.lit(TZ)})::date`);
  const rows = await q.returning(['id', 'organization_id']).execute();
  if (rows.length) {
    await db.insertInto('tenant_audit_log').values(rows.map((r) => ({
      organization_id: r.organization_id, actor_staff_id: opts.actor?.staffId ?? null, actor_email_masked: null,
      actor_role: opts.actor?.role ?? 'system', action: 'puerta.booking.day_closed', target_type: 'space_booking',
      target_id: r.id, metadata: JSON.stringify({ auto: !opts.actor, date: opts.date ?? null }),
    }))).execute();
  }
  return rows.map((r) => ({ id: r.id, organizationId: r.organization_id }));
}
