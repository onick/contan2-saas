// apps/api-v2/src/routes/puerta-bookings.ts · AGENDA de reservas de una sala
// permanente (Sala VR): el encargado agenda visitas de colegios.
//   GET   /puerta/bookings?from=&to=&salaId=  · agenda (rango; default próximos)
//   POST  /puerta/bookings                    · crear reserva (scheduled)
//   PATCH /puerta/bookings/:id                 · confirmar(+email)/cancelar/no-vino/reprogramar
//   POST  /puerta/bookings/:id/checkin         · check-in desde la reserva → attendance
// Tenant-scoped, staff. La edición confirma con email al profesor (dry-run sin
// RESEND). El check-in reusa la semántica de grupo de la Puerta (cada entrada
// cuenta, sin cupo): profesor + alumnos como companions_children.

import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, type DbClient } from '@contan2/db';
import {
  PuertaBookingCreateRequestSchema,
  PuertaBookingUpdateRequestSchema,
  type PuertaBookingFull,
  type PuertaBookingsResponse,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { confirmBookingEmail } from '../services/booking-email.js';

const TZ = process.env.CHECKIN_TZ ?? 'America/Santo_Domingo';
const bookingsLimiter = createRateLimiter({ max: 120, windowMs: 60_000, prefix: endpointPrefix('bookings') });

interface SalaRow { id: string; name: string; capacity: number; occupancy: number }
async function loadPermanentSala(db: DbClient, orgId: string, id: string): Promise<SalaRow | undefined> {
  return db.selectFrom('activities')
    .select(['id', 'name', 'capacity', 'occupancy'])
    .where('id', '=', id).where('organization_id', '=', orgId)
    .where('is_permanent', '=', true).where('status', '=', 'activa')
    .executeTakeFirst();
}

type BookingRow = {
  id: string; activity_id: string; sala_name: string | null; scheduled_at: Date | string;
  colegio: string; level: string | null; contact_name: string; contact_email: string | null;
  contact_phone: string | null; student_count: number; status: string; notes: string | null;
  confirmed_at: Date | string | null; notified_at: Date | string | null; attendance_id: string | null;
};
const iso = (v: Date | string | null): string | null => (v == null ? null : new Date(v).toISOString());
function toBooking(r: BookingRow): PuertaBookingFull {
  return {
    id: r.id, salaId: r.activity_id, salaName: r.sala_name ?? '',
    scheduledAt: new Date(r.scheduled_at).toISOString(),
    colegio: r.colegio, level: r.level, contactName: r.contact_name,
    contactEmail: r.contact_email, contactPhone: r.contact_phone,
    studentCount: Number(r.student_count), status: r.status as PuertaBookingFull['status'],
    notes: r.notes, confirmedAt: iso(r.confirmed_at), notifiedAt: iso(r.notified_at),
    attendanceId: r.attendance_id,
  };
}
const todayStartSql = sql`(date_trunc('day', now() AT TIME ZONE ${sql.lit(TZ)}) AT TIME ZONE ${sql.lit(TZ)})`;

async function loadBooking(db: DbClient, orgId: string, id: string) {
  return db.selectFrom('space_bookings as b')
    .leftJoin('activities as a', 'a.id', 'b.activity_id')
    .select(['b.id', 'b.activity_id', 'a.name as sala_name', 'b.scheduled_at', 'b.colegio', 'b.level',
      'b.contact_name', 'b.contact_email', 'b.contact_phone', 'b.student_count', 'b.status', 'b.notes',
      'b.confirmed_at', 'b.notified_at', 'b.attendance_id'])
    .where('b.id', '=', id).where('b.organization_id', '=', orgId).executeTakeFirst() as Promise<BookingRow | undefined>;
}

export const puertaBookingsRoute: FastifyPluginAsync = async (app) => {
  // ── GET /puerta/bookings ────────────────────────────────────────────────────
  app.get('/puerta/bookings', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    const q = req.query as Record<string, unknown>;

    let query = db.selectFrom('space_bookings as b')
      .leftJoin('activities as a', 'a.id', 'b.activity_id')
      .select(['b.id', 'b.activity_id', 'a.name as sala_name', 'b.scheduled_at', 'b.colegio', 'b.level',
        'b.contact_name', 'b.contact_email', 'b.contact_phone', 'b.student_count', 'b.status', 'b.notes',
        'b.confirmed_at', 'b.notified_at', 'b.attendance_id'])
      .where('b.organization_id', '=', orgId);
    if (typeof q.salaId === 'string' && q.salaId) query = query.where('b.activity_id', '=', q.salaId);
    const from = typeof q.from === 'string' && q.from ? new Date(q.from) : null;
    const to = typeof q.to === 'string' && q.to ? new Date(q.to) : null;
    if (from && !Number.isNaN(from.getTime())) query = query.where('b.scheduled_at', '>=', from);
    if (to && !Number.isNaN(to.getTime())) query = query.where('b.scheduled_at', '<', to);
    // Default (sin rango): desde el inicio de hoy (local) hacia adelante.
    if (!from && !to) query = query.where(sql<boolean>`b.scheduled_at >= ${todayStartSql}`);

    const rows = await query.orderBy('b.scheduled_at', 'asc').limit(500).execute() as BookingRow[];
    const body: PuertaBookingsResponse = { bookings: rows.map(toBooking) };
    return body;
  });

  // ── POST /puerta/bookings ───────────────────────────────────────────────────
  app.post('/puerta/bookings', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    if ((await bookingsLimiter.hit(`${orgId}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiadas reservas seguidas. Esperá un momento.' }; }

    const parsed = PuertaBookingCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos de reserva inválidos.' }; }
    const d = parsed.data;
    const scheduledAt = new Date(d.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) { reply.code(400); return { error: 'Fecha/hora inválida.' }; }
    const sala = await loadPermanentSala(db, orgId, d.salaId);
    if (!sala) { reply.code(404); return { error: 'Sala no encontrada.' }; }

    const inserted = await db.insertInto('space_bookings').values({
      organization_id: orgId,
      activity_id: sala.id,
      scheduled_at: scheduledAt.toISOString(),
      colegio: d.colegio.trim(),
      level: d.level?.trim() || null,
      contact_name: d.contactName.trim(),
      contact_email: d.contactEmail?.trim() || null,
      contact_phone: d.contactPhone?.trim() || null,
      student_count: d.studentCount,
      status: 'scheduled',
      notes: d.notes?.trim() || null,
      created_by_staff_id: guard.ctx.staff.id,
    }).returning('id').executeTakeFirstOrThrow();

    await db.insertInto('tenant_audit_log').values({
      organization_id: orgId, actor_staff_id: guard.ctx.staff.id, actor_email_masked: null,
      actor_role: guard.ctx.staff.role, action: 'booking.created', target_type: 'space_booking',
      target_id: inserted.id, metadata: JSON.stringify({ colegio: d.colegio, studentCount: d.studentCount }),
    }).execute();

    reply.code(201);
    return { booking: toBooking((await loadBooking(db, orgId, inserted.id))!) };
  });

  // ── PATCH /puerta/bookings/:id · confirmar/cancelar/no-vino/reprogramar ──────
  app.patch('/puerta/bookings/:id', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;
    const parsed = PuertaBookingUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos inválidos.' }; }

    const existing = await loadBooking(db, orgId, id);
    if (!existing) { reply.code(404); return { error: 'Reserva no encontrada.' }; }

    const nowIso = new Date().toISOString();
    if (parsed.data.action === 'cancel') {
      await db.updateTable('space_bookings').set({ status: 'cancelled', updated_at: nowIso }).where('id', '=', id).where('organization_id', '=', orgId).execute();
    } else if (parsed.data.action === 'no_show') {
      await db.updateTable('space_bookings').set({ status: 'no_show', updated_at: nowIso }).where('id', '=', id).where('organization_id', '=', orgId).execute();
    } else if (parsed.data.action === 'reschedule') {
      const when = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
      if (!when || Number.isNaN(when.getTime())) { reply.code(400); return { error: 'Nueva fecha/hora inválida.' }; }
      await db.updateTable('space_bookings').set({ scheduled_at: when.toISOString(), updated_at: nowIso }).where('id', '=', id).where('organization_id', '=', orgId).execute();
    } else { // confirm
      await db.updateTable('space_bookings').set({ status: 'confirmed', confirmed_at: nowIso, updated_at: nowIso }).where('id', '=', id).where('organization_id', '=', orgId).execute();
      // Email al profesor (dry-run sin RESEND); marca notified_at sólo si envía.
      if (existing.contact_email) {
        const r = await confirmBookingEmail(db, orgId, existing.contact_email, {
          salaName: existing.sala_name ?? 'Sala', scheduledAt: existing.scheduled_at,
          colegio: existing.colegio, level: existing.level, contactName: existing.contact_name,
          studentCount: Number(existing.student_count),
        });
        if ('sent' in r && r.sent === true) {
          await db.updateTable('space_bookings').set({ notified_at: new Date().toISOString() }).where('id', '=', id).execute().catch(() => {});
        }
      }
    }

    return { booking: toBooking((await loadBooking(db, orgId, id))!) };
  });

  // ── POST /puerta/bookings/:id/checkin · check-in desde la reserva ────────────
  app.post('/puerta/bookings/:id/checkin', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;

    const b = await loadBooking(db, orgId, id);
    if (!b) { reply.code(404); return { error: 'Reserva no encontrada.' }; }
    if (b.attendance_id) { reply.code(409); return { error: 'La reserva ya tiene check-in.' }; }
    if (b.status === 'cancelled') { reply.code(409); return { error: 'La reserva está cancelada.' }; }
    const sala = await loadPermanentSala(db, orgId, b.activity_id);
    if (!sala) { reply.code(404); return { error: 'Sala no encontrada.' }; }

    const students = Number(b.student_count);
    const attendanceId = randomUUID();
    await db.transaction().execute(async (tx) => {
      // Grupo: profesor (1) + alumnos como companions_children. Sin cupo/dedup.
      await tx.insertInto('attendance').values({
        id: attendanceId, user_id: null, user_code: null,
        activity_id: sala.id, activity_name: sala.name, organization_id: orgId,
        checked_in_at: new Date().toISOString(), anonymous: true,
        companions_children: students, companions_adults: 0,
        group_label: b.colegio, group_level: b.level, group_contact: b.contact_name,
      }).execute();
      await tx.updateTable('space_bookings')
        .set({ status: 'attended', attendance_id: attendanceId, updated_at: new Date().toISOString() })
        .where('id', '=', id).where('organization_id', '=', orgId).execute();
    });

    reply.code(201);
    return { booking: toBooking((await loadBooking(db, orgId, id))!), partySize: 1 + students };
  });
};
