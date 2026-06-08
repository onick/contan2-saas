import type { FastifyPluginAsync } from 'fastify';
import { getDb, sql } from '@contan2/db';
import type {
  CheckinMetricsResponse,
  CheckinActivitiesResponse,
  CheckinVisitorsResponse,
  CheckinActivityItem,
  CheckinVisitorItem,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { parseSearch, likeContains } from '../query.js';

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
  // código/nombre/apellido/email/teléfono (ILIKE). q obligatorio (≥2 chars) →
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
        ]),
      )
      // Orden determinista: más visitas primero, desempate por created_at + id.
      .orderBy('visit_count', 'desc')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();

    const items: CheckinVisitorItem[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      visitCount: Number(r.visit_count),
    }));
    return { items } satisfies CheckinVisitorsResponse;
  });
};
