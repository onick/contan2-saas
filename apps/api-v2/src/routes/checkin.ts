import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { getDb, sql } from '@contan2/db';
import {
  AdminCheckinRequestSchema,
  AdminAnonymousCheckinRequestSchema,
  type CheckinMetricsResponse,
  type CheckinActivitiesResponse,
  type CheckinVisitorsResponse,
  type CheckinActivityItem,
  type CheckinVisitorItem,
  type AdminCheckinResponse,
  type AdminAnonymousCheckinResponse,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { protocolBadgeFor, protocolMarksFor } from '../services/protocol-info.js';
import { parseSearch, likeContains } from '../query.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { CheckinError, checkinIdentified, reserveCapacity } from '../services/checkin-core.js';
import { writeCheckinAudit } from '../services/checkin-audit.js';

// Check-in administrativo · LECTURA (Check-in A). Consola operativa del staff
// autenticado (owner/admin/operator). Todo tenant-scoped por la sesión
// (requireTenantStaff); organization_id JAMÁS del cliente. Sin writes.
//
// "Hoy": v2 NO tiene timezone por tenant → se usa una tz ÚNICA de app
// (CHECKIN_TZ, default America/Santo_Domingo = tenant ancla). LIMITACIÓN: para
// multi-tenant cross-tz haría falta una columna `timezone` por org (migración
// futura). Los "últimos 10 min" son absolutos (now() - interval), tz-independientes.
// Las métricas/movimiento cuentan check-ins REALES (checked_in_at IS NOT NULL).
const DEFAULT_CHECKIN_TZ = 'America/Santo_Domingo';

// Valida CHECKIN_TZ contra las zonas IANA del runtime. Un valor inválido NO
// rompe el server: cae al default documentado (y avisa en logs). Validarla acá
// también hace seguro inyectarla como literal en `AT TIME ZONE`.
export function resolveCheckinTz(): string {
  const raw = process.env.CHECKIN_TZ;
  if (!raw) return DEFAULT_CHECKIN_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw }); // lanza RangeError si no es IANA
    return raw;
  } catch {
    // eslint-disable-next-line no-console
    console.warn(`[checkin] CHECKIN_TZ="${raw}" no es una zona IANA válida; usando ${DEFAULT_CHECKIN_TZ}.`);
    return DEFAULT_CHECKIN_TZ;
  }
}
const CHECKIN_TZ = resolveCheckinTz();

// Límite de resultados de búsqueda: bajo, para evitar dumps. q mínimo 2 chars.
const VISITORS_DEFAULT_LIMIT = 10;
const VISITORS_MAX_LIMIT = 20;
const VISITORS_MIN_Q = 2;

// Rate-limit de ESCRITURA (limiter compartido Redis/in-memory). Namespace por
// entorno+endpoint (endpointPrefix); key `${orgId}:${ip}` (sin PII). Límites
// generosos para no bloquear una puerta concurrida.
const ANON_ENDPOINT = 'checkin.anonymous';
const manualLimiter = createRateLimiter({ max: 60, windowMs: 60_000, prefix: endpointPrefix('checkin-manual') });
const anonLimiter = createRateLimiter({ max: 60, windowMs: 60_000, prefix: endpointPrefix('checkin-anon') });

export const checkinRoute: FastifyPluginAsync = async (app) => {
  // GET /api/v2/checkin/metrics
  app.get('/checkin/metrics', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;

    // Inicio del día en la tz de app (timestamptz de la medianoche local de hoy).
    const todayStart = sql`(date_trunc('day', now() AT TIME ZONE ${sql.lit(CHECKIN_TZ)}) AT TIME ZONE ${sql.lit(CHECKIN_TZ)})`;
    // Una sola consulta (subqueries) → sin N+1.
    const res = await sql<{ today: string; last10: string; uniq: string; active: string }>`
      SELECT
        (SELECT count(*) FROM attendance
           WHERE organization_id = ${orgId} AND checked_in_at >= ${todayStart}) AS today,
        (SELECT count(*) FROM attendance
           WHERE organization_id = ${orgId} AND checked_in_at >= now() - interval '10 minutes') AS last10,
        ((SELECT count(DISTINCT user_id) FROM attendance
            WHERE organization_id = ${orgId} AND user_id IS NOT NULL AND checked_in_at >= ${todayStart})
         + (SELECT count(*) FROM attendance
            WHERE organization_id = ${orgId} AND anonymous = true AND checked_in_at >= ${todayStart})) AS uniq,
        (SELECT count(*) FROM activities
           WHERE organization_id = ${orgId} AND status = 'activa') AS active
    `.execute(db);
    const m = res.rows[0]!;

    const body: CheckinMetricsResponse = {
      metrics: {
        checkinsToday: Number(m.today),
        checkinsLast10Min: Number(m.last10),
        uniqueVisitorsToday: Number(m.uniq),
        activeActivities: Number(m.active),
      },
      serverNow: new Date().toISOString(),
      timezone: CHECKIN_TZ,
    };
    return body;
  });

  // GET /api/v2/checkin/activities · sólo status='activa', con movimiento reciente
  // (check-ins últimos 10 min) en UNA query (LEFT JOIN agregado, sin N+1).
  app.get('/checkin/activities', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;

    const res = await sql<{
      id: string; name: string; location: string; date: Date;
      capacity: number; enrolled_count: number; recent: string;
    }>`
      SELECT a.id, a.name, a.location, a.date, a.capacity, a.enrolled_count,
             COALESCE(r.recent, 0) AS recent
      FROM activities a
      LEFT JOIN (
        SELECT activity_id, count(*) AS recent
        FROM attendance
        WHERE organization_id = ${orgId} AND checked_in_at >= now() - interval '10 minutes'
        GROUP BY activity_id
      ) r ON r.activity_id = a.id
      WHERE a.organization_id = ${orgId} AND a.status = 'activa'
      ORDER BY a.date ASC, a.id ASC
    `.execute(db);

    const items: CheckinActivityItem[] = res.rows.map((row) => {
      const capacity = Number(row.capacity);
      const enrolledCount = Number(row.enrolled_count);
      const available = Math.max(0, capacity - enrolledCount);
      return {
        id: row.id,
        name: row.name,
        location: row.location,
        date: new Date(row.date).toISOString(),
        capacity,
        enrolledCount,
        available,
        occupancyPct: capacity > 0 ? Math.round((enrolledCount / capacity) * 100) : 0,
        recentMovement: Number(row.recent),
        full: enrolledCount >= capacity,
      };
    });
    const body: CheckinActivitiesResponse = { items, serverNow: new Date().toISOString() };
    return body;
  });

  // GET /api/v2/checkin/visitors?q=&limit= · búsqueda server-side tenant-scoped por
  // código/nombre/apellido/NOMBRE COMPLETO/email/teléfono (ILIKE; el nombre
  // completo es accent-insensitive — 'marcelino francisco' encuentra a
  // 'Marcelino Francisco M.', mismo bug que el kiosko #122). q ≥2 chars →
  // sin resultados si está vacío/corto (evita dumps). Respuesta mínima (sin teléfono).
  app.get('/checkin/visitors', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;

    const query = (req.query ?? {}) as Record<string, unknown>;
    const search = parseSearch(query.q);
    if (search.error) { reply.code(400); return { error: 'Parámetro de búsqueda inválido.' }; }
    // q ausente/vacío/corto → lista vacía (nunca dump completo).
    if (!search.q || search.q.length < VISITORS_MIN_Q) {
      return { items: [] } satisfies CheckinVisitorsResponse;
    }
    const n = Number(query.limit);
    const limit = Number.isInteger(n) && n > 0 ? Math.min(n, VISITORS_MAX_LIMIT) : VISITORS_DEFAULT_LIMIT;
    const pattern = likeContains(search.q);

    const rows = await db
      .selectFrom('users')
      .select(['id', 'code', 'first_name', 'last_name', 'email', 'visit_count'])
      .where('organization_id', '=', orgId)
      .where((eb) =>
        eb.or([
          eb('code', 'ilike', pattern),
          eb('first_name', 'ilike', pattern),
          eb('last_name', 'ilike', pattern),
          eb('email', 'ilike', pattern),
          eb('phone', 'ilike', pattern),
          // Nombre COMPLETO, sin acentos en ambos lados (frases multi-palabra).
          sql<boolean>`lower(translate(first_name || ' ' || last_name, 'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU')) like '%' || lower(translate(${search.q}, 'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU')) || '%'`,
        ]),
      )
      // Orden determinista: más visitas primero, desempate por created_at + id.
      .orderBy('visit_count', 'desc')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();

    // Marca de protocolo (PR-5) en un solo query por lote; best-effort.
    const marks = await protocolMarksFor(db, orgId, rows.map((r) => r.id)).catch(() => new Map());
    const items: CheckinVisitorItem[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      visitCount: Number(r.visit_count),
      protocol: marks.get(r.id) ?? null,
    }));
    return { items } satisfies CheckinVisitorsResponse;
  });

  // POST /api/v2/checkin · ESCRITURA. Check-in manual de visitante (existente por
  // código/email o nuevo inline). owner/admin/operator. Reusa el núcleo compartido
  // (capacidad atómica + idempotencia (org,user,activity)). Auditoría DENTRO de la
  // tx → si falla, rollback completo. organizationId/actor jamás del cliente.
  app.post('/checkin', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    if ((await manualLimiter.hit(`${orgId}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: 'Demasiados intentos. Esperá un momento e intentá de nuevo.' };
    }
    const parsed = AdminCheckinRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos de check-in inválidos.' }; }
    const { activityId, visitor, companionsChildren } = parsed.data;
    const staff = guard.ctx.staff;

    try {
      const result = await db.transaction().execute(async (tx) => {
        const r = await checkinIdentified(tx, { orgId, codePrefix: guard.ctx.org.codePrefix, activityId, visitor, companionsChildren });
        await writeCheckinAudit(tx, {
          orgId, staff: { id: staff.id, email: staff.email, role: staff.role },
          action: 'checkin.manual', activityId: r.activity.id, attendanceId: r.attendanceId,
          mode: r.isNew ? 'new' : 'existing', ip: req.ip, ua: req.headers['user-agent'] ?? null,
        });
        return r;
      });
      reply.code(201);
      // Banner de protocolo (PR-5): best-effort, fuera de la tx.
      const protocol = await protocolBadgeFor(db, orgId, result.userId, result.activity.id).catch(() => null);
      const body: AdminCheckinResponse = {
        code: result.code, visitCount: result.visitCount, partySize: result.partySize,
        activity: result.activity, mode: result.isNew ? 'new' : 'existing', protocol,
      };
      return body;
    } catch (e) {
      if (e instanceof CheckinError) { reply.code(e.status); return { error: e.message }; }
      throw e;
    }
  });

  // POST /api/v2/checkin/anonymous · "+1 sin credencial". Registra EXACTAMENTE una
  // asistencia anónima (user_id/user_code null), enrolled_count +1 atómico. 201 en
  // éxito; NUNCA crea usuario ni código. Protección anti doble-click: header
  // **Idempotency-Key** obligatorio, deduplicado TRANSACCIONAL (tabla
  // checkin_idempotency, PK org+endpoint+key). Misma key → devuelve el original
  // (200, replay). El claim de la key vive en la MISMA tx que la reserva/asistencia/
  // audit → si algo falla, se libera (rollback). La concurrencia la serializa el
  // índice único (el 2º insert bloquea hasta el commit del 1º).
  app.post('/checkin/anonymous', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    if ((await anonLimiter.hit(`${orgId}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: 'Demasiados intentos. Esperá un momento e intentá de nuevo.' };
    }
    const key = String(req.headers['idempotency-key'] ?? '').trim();
    if (!key || key.length > 200) {
      reply.code(400);
      return { error: 'Falta el header Idempotency-Key (string del cliente).' };
    }
    const parsed = AdminAnonymousCheckinRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos inválidos.' }; }
    const { activityId } = parsed.data;
    const staff = guard.ctx.staff;

    try {
      const out = await db.transaction().execute(async (tx) => {
        const attendanceId = randomUUID();
        // Claim de la Idempotency-Key (transaccional) con TTL 24h. Si la key existe
        // y NO expiró → no actualiza → RETURNING vacío → replay. Si EXPIRÓ → se
        // reclama (DO UPDATE WHERE expires_at<=now()) y se procesa como nueva.
        const ttl = sql<string>`now() + interval '24 hours'`;
        const claimed = await tx
          .insertInto('checkin_idempotency')
          .values({ organization_id: orgId, endpoint: ANON_ENDPOINT, idempotency_key: key, attendance_id: attendanceId, expires_at: ttl })
          .onConflict((oc) =>
            oc
              .columns(['organization_id', 'endpoint', 'idempotency_key'])
              .doUpdateSet({ attendance_id: attendanceId, expires_at: ttl })
              .where(sql<boolean>`checkin_idempotency.expires_at <= now()`),
          )
          .returning('attendance_id')
          .executeTakeFirst();
        if (!claimed) {
          // Key ya usada (commit previo) → devolver el resultado ORIGINAL.
          const prev = await tx
            .selectFrom('checkin_idempotency').select('attendance_id')
            .where('organization_id', '=', orgId).where('endpoint', '=', ANON_ENDPOINT).where('idempotency_key', '=', key)
            .executeTakeFirstOrThrow();
          const act = await tx
            .selectFrom('attendance')
            .innerJoin('activities', 'activities.id', 'attendance.activity_id')
            .select(['attendance.id as aid', 'activities.id as actid', 'activities.name as actname'])
            .where('attendance.id', '=', prev.attendance_id)
            .executeTakeFirst();
          return { replay: true, attendanceId: prev.attendance_id, activity: act ? { id: act.actid, name: act.actname } : null };
        }
        // Nueva: reserva cupo (partySize 1) + asistencia anónima + auditoría.
        const reserved = await reserveCapacity(tx, orgId, activityId, 1);
        await tx.insertInto('attendance').values({
          id: attendanceId, organization_id: orgId, user_id: null, user_code: null,
          activity_id: reserved.id, activity_name: reserved.name, companions_children: 0,
          checked_in_at: new Date().toISOString(), anonymous: true,
        }).execute();
        await writeCheckinAudit(tx, {
          orgId, staff: { id: staff.id, email: staff.email, role: staff.role },
          action: 'checkin.anonymous', activityId: reserved.id, attendanceId,
          mode: 'anonymous', ip: req.ip, ua: req.headers['user-agent'] ?? null,
        });
        return { replay: false, attendanceId, activity: reserved };
      });

      if (!out.activity) { reply.code(409); return { error: 'No se pudo recuperar el registro original.' }; }
      reply.code(out.replay ? 200 : 201);
      const body: AdminAnonymousCheckinResponse = {
        attendanceId: out.attendanceId, activity: out.activity, mode: 'anonymous', replay: out.replay,
      };
      return body;
    } catch (e) {
      if (e instanceof CheckinError) { reply.code(e.status); return { error: e.message }; }
      throw e;
    }
  });
};
