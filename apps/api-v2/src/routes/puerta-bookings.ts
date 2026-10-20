// apps/api-v2/src/routes/puerta-bookings.ts · AGENDA de reservas de una sala
// permanente (Sala VR): el encargado agenda visitas de colegios.
//   GET   /puerta/bookings?from=&to=&salaId=   · agenda (rango; default próximos)
//   POST  /puerta/bookings                     · crear reserva (scheduled)
//   PATCH /puerta/bookings/:id                 · confirm | cancel | no_show | reschedule | edit
//   GET   /puerta/bookings/:id/history         · filas `puerta.booking.*` de la auditoría de esa reserva
//   POST  /puerta/bookings/:id/no-show         · "No vino" manual
//   POST  /puerta/bookings/:id/checkin         · check-in → attendance (atómico; solo el día, o force)
//   POST  /puerta/bookings/close-day?date=     · cierre del día: vencidas sin asistencia → no_show
// Tenant-scoped, staff.
//
// MÁQUINA DE ESTADOS (PUE-A03). Cada transición es un `UPDATE … WHERE status IN (desde)
// RETURNING`: si no devuelve fila, el estado actual no lo permite → 409.
//   confirm     scheduled                      → confirmed
//   cancel      scheduled | confirmed          → cancelled
//   no_show     scheduled | confirmed          → no_show
//   reschedule  scheduled | confirmed | no_show → confirmed (guarda rescheduled_from)
//   edit        scheduled | confirmed | no_show → (mismo estado; corrige datos del grupo/contacto)
//   checkin     scheduled | confirmed | no_show → attended (no_show→attended: llegó tarde)
//   attended y cancelled son terminales. Borrar la asistencia (Deshacer) devuelve la
//   reserva a confirmed (trigger de la migración 056).
// El correo se envía FUERA de la transacción y solo una vez (confirmación si
// notified_at IS NULL; cancelación solo si ya se avisó; reprogramación siempre). Un
// error de envío queda en email_error; sin RESEND_API_KEY es dry-run (no es error).

import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { getDb, sql, withTenant, type DbClient } from '@contan2/db';
import {
  PuertaBookingCheckinRequestSchema,
  PuertaBookingCreateRequestSchema,
  PuertaBookingUpdateRequestSchema,
  type PuertaBookingHistoryResponse,
  type PuertaBookingUpdateRequest,
  type PuertaBookingCloseDayResponse,
  type PuertaBookingFull,
  type PuertaBookingsResponse,
} from '@contan2/contracts';
import { requireRole, requireTenantStaff } from '../guard.js';
import { DOOR_WRITE_ROLES, PADRON_READ_ROLES } from '../rbac-roles.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { bookingEmail, type BookingEmailKind, type BookingInfo } from '../services/booking-email.js';
import { closeUnattendedBookings } from '../services/booking-close.js';

import { REPORT_TZ as TZ } from '../services/timezone.js';
const bookingsLimiter = createRateLimiter({ max: 120, windowMs: 60_000, prefix: endpointPrefix('bookings') });
// PATCH / check-in / no-show: tope por org+IP contra toques repetidos o scripts.
const actionLimiter = createRateLimiter({ max: 120, windowMs: 60_000, prefix: endpointPrefix('bookings-action') });

const MANAGER_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

type Act = 'confirm' | 'cancel' | 'no_show' | 'reschedule' | 'edit';
// Estados DESDE los que se permite cada acción (la tabla de arriba, en código).
const FROM = {
  confirm: ['scheduled'],
  cancel: ['scheduled', 'confirmed'],
  no_show: ['scheduled', 'confirmed'],
  reschedule: ['scheduled', 'confirmed', 'no_show'],
  edit: ['scheduled', 'confirmed', 'no_show'],
  checkin: ['scheduled', 'confirmed', 'no_show'],
} as const satisfies Record<string, readonly string[]>;

const STATE_ES: Record<string, string> = {
  scheduled: 'agendada', confirmed: 'confirmada', attended: 'con asistencia registrada',
  no_show: 'marcada como "No vino"', cancelled: 'cancelada',
};
const VERB_ES: Record<keyof typeof FROM, string> = {
  confirm: 'confirmar', cancel: 'cancelar', no_show: 'marcar como "No vino"',
  reschedule: 'reprogramar', edit: 'editar', checkin: 'registrar la entrada de',
};
const stateError = (a: keyof typeof FROM, status: string) =>
  `No se puede ${VERB_ES[a]} esta reserva: ya está ${STATE_ES[status] ?? status}.`;

const DAY_FMT = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const fmtDay = (v: Date | string) => DAY_FMT.format(new Date(v));

// Corta el handler dentro de la tx → rollback (p. ej. la asistencia insertada si el reclamo pierde).
class BookingAbort extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) { super(String(body.error ?? 'abort')); }
}

interface SalaRow { id: string; name: string; has_agenda: boolean }
async function loadPermanentSala(db: DbClient, orgId: string, id: string): Promise<SalaRow | undefined> {
  return db.selectFrom('activities')
    .select(['id', 'name', 'has_agenda'])
    .where('id', '=', id).where('organization_id', '=', orgId)
    .where('is_permanent', '=', true).where('status', '=', 'activa')
    .executeTakeFirst();
}

type BookingRow = {
  id: string; activity_id: string; sala_name: string | null; scheduled_at: Date | string;
  colegio: string; group_kind: string | null; level: string | null; contact_name: string; contact_email: string | null;
  contact_phone: string | null; student_count: number; status: string; notes: string | null;
  confirmed_at: Date | string | null; notified_at: Date | string | null; attendance_id: string | null;
  rescheduled_from: Date | string | null; email_error: string | null;
};
const iso = (v: Date | string | null): string | null => (v == null ? null : new Date(v).toISOString());
function toBooking(r: BookingRow): PuertaBookingFull {
  return {
    id: r.id, salaId: r.activity_id, salaName: r.sala_name ?? '',
    scheduledAt: new Date(r.scheduled_at).toISOString(),
    colegio: r.colegio, kind: r.group_kind, level: r.level, contactName: r.contact_name,
    contactEmail: r.contact_email, contactPhone: r.contact_phone,
    studentCount: Number(r.student_count), status: r.status as PuertaBookingFull['status'],
    notes: r.notes, confirmedAt: iso(r.confirmed_at), notifiedAt: iso(r.notified_at),
    attendanceId: r.attendance_id,
    rescheduledFrom: iso(r.rescheduled_from), emailError: r.email_error,
  };
}
const BOOKINGS_LIST_CAP = 500; // tope de reservas del listado
const todayStartSql = sql`(date_trunc('day', now() AT TIME ZONE ${sql.lit(TZ)}) AT TIME ZONE ${sql.lit(TZ)})`;

const BOOKING_COLS = ['b.id', 'b.activity_id', 'a.name as sala_name', 'b.scheduled_at', 'b.colegio', 'b.group_kind', 'b.level',
  'b.contact_name', 'b.contact_email', 'b.contact_phone', 'b.student_count', 'b.status', 'b.notes',
  'b.confirmed_at', 'b.notified_at', 'b.attendance_id', 'b.rescheduled_from', 'b.email_error'] as const;

async function loadBooking(db: DbClient, orgId: string, id: string) {
  return db.selectFrom('space_bookings as b')
    .leftJoin('activities as a', 'a.id', 'b.activity_id')
    .select([...BOOKING_COLS])
    .where('b.id', '=', id).where('b.organization_id', '=', orgId).executeTakeFirst() as Promise<BookingRow | undefined>;
}
async function reloadBooking(db: DbClient, orgId: string, id: string): Promise<PuertaBookingFull> {
  return withTenant(db, orgId, async (tx) => toBooking((await loadBooking(tx, orgId, id))!));
}

type Staff = { id: string; role: string };
async function audit(db: DbClient, orgId: string, staff: Staff, action: string, bookingId: string, metadata: Record<string, unknown> = {}) {
  await db.insertInto('tenant_audit_log').values({
    organization_id: orgId, actor_staff_id: staff.id, actor_email_masked: null, actor_role: staff.role,
    action: `puerta.booking.${action}`, target_type: 'space_booking', target_id: bookingId, metadata: JSON.stringify(metadata),
  }).execute();
}

const infoOf = (b: BookingRow, scheduledAt: Date | string, previousAt?: Date | string | null): BookingInfo => ({
  salaName: b.sala_name ?? 'Sala', scheduledAt, colegio: b.colegio, kind: b.group_kind, level: b.level,
  contactName: b.contact_name, studentCount: Number(b.student_count), previousAt: previousAt ?? null,
});

// Envío FUERA de la transacción. Éxito → notified_at (y limpia email_error); fallo →
// email_error; dry-run (skipped) no toca nada. Nunca lanza: la acción ya se hizo.
async function deliverEmail(db: DbClient, orgId: string, id: string, kind: BookingEmailKind, to: string, info: BookingInfo): Promise<void> {
  try {
    let r: Awaited<ReturnType<typeof bookingEmail>>;
    try { r = await bookingEmail(kind, db, orgId, to, info); }
    catch (e) { r = { sent: false, error: e instanceof Error ? e.message : String(e) }; }
    if ('skipped' in r) return;
    await withTenant(db, orgId, async (tx) => {
      if (r.sent === true) {
        await tx.updateTable('space_bookings').set({ notified_at: new Date().toISOString(), email_error: null }).where('id', '=', id).where('organization_id', '=', orgId).execute();
      } else {
        await tx.updateTable('space_bookings').set({ email_error: String(r.error).slice(0, 500) }).where('id', '=', id).where('organization_id', '=', orgId).execute();
      }
    });
  } catch { /* el estado ya quedó; el correo se puede reintentar a mano */ }
}

// El cuerpo se valida DESPUÉS del guard de rol (un rol sin permiso recibe 403, no 400).
type EditFields = NonNullable<PuertaBookingUpdateRequest['edit']>;
type Resolved = { act: Act; when?: Date; edit?: EditFields } | { status: number; error: string };
async function runTransition(req: FastifyRequest, reply: FastifyReply, resolve: () => Resolved) {
  const db = getDb();
  const guard = requireRole(await requireTenantStaff(db, req), DOOR_WRITE_ROLES, 'No tienes permiso para modificar reservas de la puerta.');
  if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
  const orgId = guard.ctx.org.id;
  const staff = guard.ctx.staff;
  if ((await actionLimiter.hit(`${orgId}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiadas acciones seguidas. Espera un momento.' }; }
  const r = resolve();
  if ('error' in r) { reply.code(r.status); return { error: r.error }; }
  const { act, when, edit } = r;
  const id = (req.params as { id: string }).id;

  const out = await withTenant(db, orgId, async (tx) => {
    const existing = await loadBooking(tx, orgId, id);
    if (!existing) return { status: 404, body: { error: 'Reserva no encontrada.' } as Record<string, unknown> };

    const nowIso = new Date().toISOString();
    const set: Record<string, unknown> = { updated_at: nowIso };
    if (act === 'confirm') { set.status = 'confirmed'; set.confirmed_at = nowIso; }
    else if (act === 'cancel') { set.status = 'cancelled'; set.cancelled_at = nowIso; }
    else if (act === 'no_show') { set.status = 'no_show'; set.no_show_at = nowIso; }
    else if (act === 'edit') {
      const e = edit!;
      if (e.colegio !== undefined) set.colegio = e.colegio.trim();
      if (e.kind !== undefined) set.group_kind = e.kind?.trim() || null;
      if (e.level !== undefined) set.level = e.level?.trim() || null;
      if (e.contactName !== undefined) set.contact_name = e.contactName.trim();
      if (e.contactEmail !== undefined) set.contact_email = e.contactEmail?.trim() || null;
      if (e.contactPhone !== undefined) set.contact_phone = e.contactPhone?.trim() || null;
      if (e.studentCount !== undefined) set.student_count = e.studentCount;
      if (e.notes !== undefined) set.notes = e.notes?.trim() || null;
    } else {
      set.status = 'confirmed';
      set.scheduled_at = when!.toISOString();
      set.rescheduled_from = sql`scheduled_at`; // el valor ANTERIOR (el SET evalúa con la fila vieja)
      set.confirmed_at = sql`coalesce(confirmed_at, ${nowIso}::timestamptz)`;
      set.no_show_at = null;
    }
    const won = await tx.updateTable('space_bookings').set(set)
      .where('id', '=', id).where('organization_id', '=', orgId)
      .where('status', 'in', FROM[act]).returning('id').executeTakeFirst();
    if (!won) {
      // Lo ganó otra petición o el estado no lo permite: informar el estado ACTUAL.
      const cur = (await loadBooking(tx, orgId, id))?.status ?? existing.status;
      return { status: 409, body: { error: stateError(act, cur) } };
    }
    await audit(tx, orgId, staff, act === 'no_show' ? 'no_show' : act === 'confirm' ? 'confirmed' : act === 'cancel' ? 'cancelled' : act === 'edit' ? 'edited' : 'rescheduled', id,
      act === 'reschedule' ? { from: new Date(existing.scheduled_at).toISOString(), to: when!.toISOString() }
        : act === 'edit' ? { fields: Object.keys(edit!).filter((k) => (edit as Record<string, unknown>)[k] !== undefined) } : {});
    return { status: 200, body: {}, existing };
  });

  if (out.status !== 200) { reply.code(out.status); return out.body; }

  // Correo fuera de la transacción (la conexión ya volvió al pool).
  const ex = out.existing!;
  if (ex.contact_email) {
    if (act === 'confirm' && ex.notified_at == null) {
      await deliverEmail(db, orgId, id, 'confirmed', ex.contact_email, infoOf(ex, ex.scheduled_at));
    } else if (act === 'cancel' && ex.notified_at != null) {
      await deliverEmail(db, orgId, id, 'cancelled', ex.contact_email, infoOf(ex, ex.scheduled_at));
    } else if (act === 'reschedule') {
      // Nunca avisada → su primer correo es la confirmación (con la fecha nueva).
      await deliverEmail(db, orgId, id, ex.notified_at != null ? 'rescheduled' : 'confirmed', ex.contact_email,
        infoOf(ex, when!, ex.scheduled_at));
    }
  }
  return { booking: await reloadBooking(db, orgId, id) };
}

export const puertaBookingsRoute: FastifyPluginAsync = async (app) => {
  // ── GET /puerta/bookings ────────────────────────────────────────────────────
  app.get('/puerta/bookings', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), PADRON_READ_ROLES, 'No tienes permiso para ver las reservas de la puerta.');
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    const q = req.query as Record<string, unknown>;

    let query = db.selectFrom('space_bookings as b')
      .leftJoin('activities as a', 'a.id', 'b.activity_id')
      .select([...BOOKING_COLS])
      .where('b.organization_id', '=', orgId);
    if (typeof q.salaId === 'string' && q.salaId) query = query.where('b.activity_id', '=', q.salaId);
    // `from`/`to` aceptan YMD (AAAA-MM-DD, día local de REPORT_TZ, `to` inclusivo — PUE-A13)
    // o un instante ISO (semántica previa: `to` exclusivo).
    const parseBound = (v: unknown): { ymd: string } | { at: Date } | null => {
      if (typeof v !== 'string' || !v) return null;
      if (YMD_RE.test(v)) return Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) ? null : { ymd: v };
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : { at: d };
    };
    const from = parseBound(q.from);
    const to = parseBound(q.to);
    if (from) query = query.where('ymd' in from
      ? sql<boolean>`b.scheduled_at >= (${from.ymd}::timestamp AT TIME ZONE ${sql.lit(TZ)})`
      : sql<boolean>`b.scheduled_at >= ${from.at}`);
    if (to) query = query.where('ymd' in to
      ? sql<boolean>`b.scheduled_at < ((${to.ymd}::date + 1)::timestamp AT TIME ZONE ${sql.lit(TZ)})`
      : sql<boolean>`b.scheduled_at < ${to.at}`);
    // Default (sin rango): desde el inicio de hoy (local) hacia adelante.
    if (!from && !to) query = query.where(sql<boolean>`b.scheduled_at >= ${todayStartSql}`);

    // Una de más para saber si la lista se cortó en el tope (REP-A25): la UI lo avisa.
    const fetched = await query.orderBy('b.scheduled_at', 'asc').limit(BOOKINGS_LIST_CAP + 1).execute() as BookingRow[];
    const rows = fetched.slice(0, BOOKINGS_LIST_CAP);
    const body: PuertaBookingsResponse = { bookings: rows.map(toBooking), ...(fetched.length > BOOKINGS_LIST_CAP ? { truncated: true } : {}) };
    return body;
    });
  });

  // ── POST /puerta/bookings ───────────────────────────────────────────────────
  app.post('/puerta/bookings', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), DOOR_WRITE_ROLES, 'No tienes permiso para crear reservas en la puerta.');
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    if ((await bookingsLimiter.hit(`${orgId}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiadas reservas seguidas. Espera un momento.' }; }

    const parsed = PuertaBookingCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos de reserva inválidos.' }; }
    const d = parsed.data;
    const scheduledAt = new Date(d.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) { reply.code(400); return { error: 'Fecha/hora inválida.' }; }
    const sala = await loadPermanentSala(db, orgId, d.salaId);
    if (!sala) { reply.code(404); return { error: 'Sala no encontrada.' }; }
    // Solo las salas con agenda (mig. 057, decisión Q1: hoy la Sala VR) reciben reservas.
    if (!sala.has_agenda) { reply.code(409); return { error: 'Esta sala no tiene agenda de reservas.' }; }

    const inserted = await db.insertInto('space_bookings').values({
      organization_id: orgId,
      activity_id: sala.id,
      scheduled_at: scheduledAt.toISOString(),
      colegio: d.colegio.trim(),
      group_kind: d.kind?.trim() || null, // null = colegio
      level: d.level?.trim() || null,
      contact_name: d.contactName.trim(),
      contact_email: d.contactEmail?.trim() || null,
      contact_phone: d.contactPhone?.trim() || null,
      student_count: d.studentCount,
      status: 'scheduled',
      notes: d.notes?.trim() || null,
      created_by_staff_id: guard.ctx.staff.id,
    }).returning('id').executeTakeFirstOrThrow();

    await audit(db, orgId, guard.ctx.staff, 'created', inserted.id, { colegio: d.colegio, kind: d.kind?.trim() || null, studentCount: d.studentCount });

    reply.code(201);
    return { booking: toBooking((await loadBooking(db, orgId, inserted.id))!) };
    });
  });

  // ── PATCH /puerta/bookings/:id · confirmar/cancelar/no-vino/reprogramar ──────
  app.patch('/puerta/bookings/:id', async (req: FastifyRequest, reply) => {
    return runTransition(req, reply, () => {
      const parsed = PuertaBookingUpdateRequestSchema.safeParse(req.body);
      if (!parsed.success) return { status: 400, error: 'Datos inválidos.' };
      if (parsed.data.action === 'edit') {
        const e = parsed.data.edit;
        if (!e || Object.values(e).every((v) => v === undefined)) return { status: 400, error: 'No hay cambios que guardar.' };
        return { act: 'edit', edit: e };
      }
      if (parsed.data.action !== 'reschedule') return { act: parsed.data.action };
      const when = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined;
      if (!when || Number.isNaN(when.getTime())) return { status: 400, error: 'Nueva fecha/hora inválida.' };
      return { act: 'reschedule', when };
    });
  });

  // ── GET /puerta/bookings/:id/history · historial de una reserva ───────────────
  // Las filas `puerta.booking.*` de la auditoría con ESA reserva como objetivo, en orden
  // cronológico, con el nombre del staff (null = sistema, p. ej. el cierre automático).
  app.get('/puerta/bookings/:id/history', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), PADRON_READ_ROLES, 'No tienes permiso para ver las reservas de la puerta.');
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) { reply.code(404); return { error: 'Reserva no encontrada.' }; }
    return withTenant(db, orgId, async (tx) => {
      const exists = await tx.selectFrom('space_bookings').select('id').where('id', '=', id).where('organization_id', '=', orgId).executeTakeFirst();
      if (!exists) { reply.code(404); return { error: 'Reserva no encontrada.' }; }
      const rows = await tx.selectFrom('tenant_audit_log as l')
        .leftJoin('staff_members as s', 's.id', 'l.actor_staff_id')
        .select(['l.id', 'l.action', 'l.created_at', 'l.metadata', 's.full_name'])
        .where('l.organization_id', '=', orgId).where('l.target_type', '=', 'space_booking').where('l.target_id', '=', id)
        .where('l.action', 'like', 'puerta.booking.%')
        .orderBy('l.created_at', 'asc').orderBy('l.id', 'asc').execute();
      const body: PuertaBookingHistoryResponse = {
        history: rows.map((r) => ({
          id: String(r.id), action: r.action.replace(/^puerta\.booking\./, ''),
          at: new Date(r.created_at as Date | string).toISOString(), actor: r.full_name ?? null,
          metadata: (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata ?? {}) as Record<string, unknown>,
        })),
      };
      return body;
    });
  });

  // ── POST /puerta/bookings/:id/no-show · "No vino" manual ─────────────────────
  app.post('/puerta/bookings/:id/no-show', async (req: FastifyRequest, reply) => runTransition(req, reply, () => ({ act: 'no_show' })));

  // ── POST /puerta/bookings/close-day?date= · cierre del día (decisión Q3) ─────
  // owner/admin. Marca "No vino" las reservas del día (default hoy) ya vencidas y sin
  // asistencia. Idempotente. El barrido horario de auto-finalize cubre los días
  // anteriores; este endpoint permite cerrar HOY a demanda.
  app.post('/puerta/bookings/close-day', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), MANAGER_ROLES, 'Solo un administrador puede cerrar el día.');
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    const staff = guard.ctx.staff;
    const raw = (req.query as { date?: unknown }).date;
    return withTenant(db, orgId, async (tx) => {
      const today = (await sql<{ d: string }>`select to_char((now() AT TIME ZONE ${sql.lit(TZ)})::date, 'YYYY-MM-DD') as d`.execute(tx)).rows[0]!.d;
      const date = typeof raw === 'string' && raw ? raw : today;
      if (!YMD_RE.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) { reply.code(400); return { error: 'Fecha inválida. Usa el formato AAAA-MM-DD.' }; }
      if (date > today) { reply.code(400); return { error: 'No se puede cerrar un día que aún no llega.' }; }
      const closed = await closeUnattendedBookings(tx, { orgId, date, actor: { staffId: staff.id, role: staff.role } });
      const body: PuertaBookingCloseDayResponse = { date, closed: closed.length, bookingIds: closed.map((c) => c.id) };
      return body;
    });
  });

  // ── POST /puerta/bookings/:id/checkin · check-in desde la reserva ────────────
  // Atómico: la fila de la reserva se bloquea (FOR UPDATE) y el UPDATE de reclamo exige
  // estado permitido + attendance_id IS NULL; dos toques simultáneos → 1 asistencia.
  // Solo el día de la reserva; otro día requiere `force: true` (owner/admin).
  app.post('/puerta/bookings/:id/checkin', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), DOOR_WRITE_ROLES, 'No tienes permiso para registrar entradas en la puerta.');
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    const staff = guard.ctx.staff;
    if ((await actionLimiter.hit(`${orgId}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiadas acciones seguidas. Espera un momento.' }; }
    const parsed = PuertaBookingCheckinRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) { reply.code(400); return { error: 'Datos inválidos.' }; }
    const force = parsed.data.force === true;
    if (force && !MANAGER_ROLES.has(staff.role)) { reply.code(403); return { error: 'Solo un administrador puede registrar la entrada de una reserva de otro día.' }; }
    const id = (req.params as { id: string }).id;

    const out = await withTenant(db, orgId, async (tx) => {
      const b = await tx.selectFrom('space_bookings')
        .select(['id', 'activity_id', 'colegio', 'group_kind', 'level', 'contact_name', 'student_count', 'status', 'attendance_id', 'scheduled_at',
          sql<boolean>`(scheduled_at AT TIME ZONE ${sql.lit(TZ)})::date = (now() AT TIME ZONE ${sql.lit(TZ)})::date`.as('is_today')])
        .where('id', '=', id).where('organization_id', '=', orgId).forUpdate().executeTakeFirst();
      if (!b) return { status: 404, body: { error: 'Reserva no encontrada.' } as Record<string, unknown> };
      if (b.attendance_id || b.status === 'attended') return { status: 409, body: { error: 'La reserva ya tiene check-in.' } };
      if (!(FROM.checkin as readonly string[]).includes(b.status)) return { status: 409, body: { error: stateError('checkin', b.status) } };
      if (!b.is_today && !force) {
        return { status: 409, body: { error: `La reserva es del ${fmtDay(b.scheduled_at)}. ¿Registrar la entrada igual hoy?`, requiresForce: true } };
      }
      const sala = await loadPermanentSala(tx, orgId, b.activity_id);
      if (!sala) return { status: 404, body: { error: 'Sala no encontrada.' } };

      const students = Number(b.student_count);
      const attendanceId = randomUUID();
      const nowIso = new Date().toISOString();
      // Grupo: profesor (1) + alumnos como companions_children. Sin cupo/dedup.
      await tx.insertInto('attendance').values({
        id: attendanceId, user_id: null, user_code: null,
        activity_id: sala.id, activity_name: sala.name, organization_id: orgId,
        checked_in_at: nowIso, anonymous: true,
        companions_children: students, companions_adults: 0,
        group_label: b.colegio, group_kind: b.group_kind, group_level: b.level, group_contact: b.contact_name,
        is_permanent: true,
      }).execute();
      const claimed = await tx.updateTable('space_bookings')
        .set({ status: 'attended', attendance_id: attendanceId, updated_at: nowIso })
        .where('id', '=', id).where('organization_id', '=', orgId)
        .where('attendance_id', 'is', null).where('status', 'in', FROM.checkin)
        .returning('id').executeTakeFirst();
      if (!claimed) throw new BookingAbort(409, { error: 'La reserva ya tiene check-in.' }); // rollback del insert
      await audit(tx, orgId, staff, 'checked_in', id, { attendanceId, partySize: 1 + students, forced: force && !b.is_today });
      return { status: 201, body: { partySize: 1 + students } as Record<string, unknown> };
    }).catch((e: unknown) => {
      if (e instanceof BookingAbort) return { status: e.status, body: e.body };
      throw e;
    });

    reply.code(out.status);
    if (out.status !== 201) return out.body;
    return { booking: await reloadBooking(db, orgId, id), ...out.body };
  });
};
