// apps/api-v2/src/services/dashboard-overview.ts · agregado del dashboard (S2 ·
// paridad v1 GET /api/dashboard/stats). DEFINICIONES IDÉNTICAS a v1
// (backend/src/routes/dashboard.js), computadas en SQL (no findAll en memoria):
//
//   · Períodos hoy/7d/30d/90d sobre el DÍA LOCAL del tenant (CHECKIN_TZ; v2 aún
//     no tiene tz por org). Período actual [hoy-(days-1), mañana); anterior
//     [start-days, start).
//   · deltaPct(curr, prev): prev=0 → (curr=0 ? 0 : 100); si no round(Δ/prev·100).
//   · Serie: asistencias por día local (registered_at), huecos en 0.
//   · Visitantes nuevos: users.created_at en el período (activos).
//   · Ocupación promedio: AVG(enrolled/capacity·100) de las actividades CON
//     fecha en el período (capacity>0).
//   · Tasa de retorno: % de asistencias del período cuyo visitante tiene >1
//     visita en total (users.visit_count>1; las anónimas no son "returning").
//   · Próxima: primera activa futura. Insights: low_enrollment (<30% a <14 días),
//     near_full (90–99%), empty_activities (activas futuras con 0 inscritos).

import { sql, type DbClient } from '@contan2/db';

export const DASHBOARD_PERIODS = { today: 1, '7d': 7, '30d': 30, '90d': 90 } as const;
export type DashboardPeriod = keyof typeof DASHBOARD_PERIODS;
export const parsePeriod = (raw: unknown): DashboardPeriod =>
  (typeof raw === 'string' && raw in DASHBOARD_PERIODS ? (raw as DashboardPeriod) : '30d');

export function deltaPct(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / prev) * 100);
}

export interface OverviewInsight {
  type: 'low_enrollment' | 'near_full' | 'empty_activities';
  severity: 'warning' | 'info';
  title: string;
  message: string;
}

export interface OverviewActivity {
  id: string; name: string; type: string; category: string | null; location: string;
  date: string; capacity: number; enrolledCount: number; imageUrl: string | null;
}

export interface DashboardOverview {
  period: DashboardPeriod;
  series: { date: string; value: number }[];
  attendance: { current: number; previous: number; deltaPct: number };
  newVisitors: { current: number; previous: number; deltaPct: number };
  avgOccupancyPct: { current: number; previous: number; deltaPct: number };
  returnRatePct: { current: number; previous: number; deltaPct: number };
  upcoming: OverviewActivity | null;
  featured: (OverviewActivity & { periodAttendances: number }) | null;
  insights: OverviewInsight[];
}

export async function dashboardOverview(
  db: DbClient,
  orgId: string,
  period: DashboardPeriod,
  tz: string,
): Promise<DashboardOverview> {
  const days = DASHBOARD_PERIODS[period];
  // Hoy 00:00 LOCAL del tenant, como timestamptz (mismo patrón validado de checkin).
  const todayStart = sql<Date>`(date_trunc('day', now() AT TIME ZONE ${sql.lit(tz)}) AT TIME ZONE ${sql.lit(tz)})`;
  const start = sql<Date>`(${todayStart} - ${sql.lit(String(days - 1))}::int * interval '1 day')`;
  const end = sql<Date>`(${todayStart} + interval '1 day')`;
  const prevStart = sql<Date>`(${todayStart} - ${sql.lit(String(2 * days - 1))}::int * interval '1 day')`;

  const [serieRows, counts, occ, ret, upcomingRow, featuredRow, emptyActive] = await Promise.all([
    // Serie diaria (día LOCAL) de asistencias del período.
    db.selectFrom('attendance')
      .select([
        sql<string>`to_char(registered_at AT TIME ZONE ${sql.lit(tz)}, 'YYYY-MM-DD')`.as('d'),
        db.fn.countAll<string>().as('n'),
      ])
      .where('organization_id', '=', orgId)
      .where('registered_at', '>=', start)
      .where('registered_at', '<', end)
      .groupBy('d')
      .execute(),
    // Conteos curr/prev de asistencias y visitantes nuevos en una pasada.
    db.selectNoFrom((eb) => [
      eb.selectFrom('attendance').select(eb.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).where('registered_at', '>=', start).where('registered_at', '<', end).as('att_curr'),
      eb.selectFrom('attendance').select(eb.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).where('registered_at', '>=', prevStart).where('registered_at', '<', start).as('att_prev'),
      eb.selectFrom('users').select(eb.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).where('deleted_at', 'is', null)
        .where('created_at', '>=', start).where('created_at', '<', end).as('new_curr'),
      eb.selectFrom('users').select(eb.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).where('deleted_at', 'is', null)
        .where('created_at', '>=', prevStart).where('created_at', '<', start).as('new_prev'),
    ]).executeTakeFirstOrThrow(),
    // Ocupación promedio de actividades del período (capacity>0), curr/prev.
    db.selectNoFrom((eb) => [
      eb.selectFrom('activities')
        .select(sql<string | null>`round(avg(enrolled_count * 100.0 / capacity))`.as('v'))
        .where('organization_id', '=', orgId).where('capacity', '>', 0)
        .where('date', '>=', start).where('date', '<', end).as('occ_curr'),
      eb.selectFrom('activities')
        .select(sql<string | null>`round(avg(enrolled_count * 100.0 / capacity))`.as('v'))
        .where('organization_id', '=', orgId).where('capacity', '>', 0)
        .where('date', '>=', prevStart).where('date', '<', start).as('occ_prev'),
    ]).executeTakeFirstOrThrow(),
    // Retorno: asistencias del período de visitantes con >1 visita total.
    db.selectNoFrom((eb) => [
      eb.selectFrom('attendance')
        .innerJoin('users', 'users.id', 'attendance.user_id')
        .select(eb.fn.countAll<string>().as('n'))
        .where('attendance.organization_id', '=', orgId)
        .where('attendance.registered_at', '>=', start).where('attendance.registered_at', '<', end)
        .where('users.visit_count', '>', 1).as('ret_curr'),
      eb.selectFrom('attendance')
        .innerJoin('users', 'users.id', 'attendance.user_id')
        .select(eb.fn.countAll<string>().as('n'))
        .where('attendance.organization_id', '=', orgId)
        .where('attendance.registered_at', '>=', prevStart).where('attendance.registered_at', '<', start)
        .where('users.visit_count', '>', 1).as('ret_prev'),
    ]).executeTakeFirstOrThrow(),
    // Próxima actividad activa futura.
    db.selectFrom('activities')
      .select(['id', 'name', 'type', 'category', 'location', 'date', 'capacity', 'enrolled_count', 'image_url'])
      .where('organization_id', '=', orgId).where('status', '=', 'activa')
      .where('date', '>', sql<Date>`now()`)
      .orderBy('date', 'asc').limit(1).executeTakeFirst(),
    // Destacada: la de más asistencias DENTRO del período.
    db.selectFrom('activities as a')
      .innerJoin('attendance as att', (j) => j
        .onRef('att.activity_id', '=', 'a.id')
        .on('att.registered_at', '>=', start)
        .on('att.registered_at', '<', end))
      .select(['a.id', 'a.name', 'a.type', 'a.category', 'a.location', 'a.date', 'a.capacity', 'a.enrolled_count', 'a.image_url'])
      .select((eb) => eb.fn.count('att.id').as('n'))
      .where('a.organization_id', '=', orgId)
      .groupBy(['a.id', 'a.name', 'a.type', 'a.category', 'a.location', 'a.date', 'a.capacity', 'a.enrolled_count', 'a.image_url'])
      .orderBy('n', 'desc').limit(1).executeTakeFirst(),
    // Activas futuras sin inscritos (insight).
    db.selectFrom('activities').select(db.fn.countAll<string>().as('n'))
      .where('organization_id', '=', orgId).where('status', '=', 'activa')
      .where('date', '>', sql<Date>`now()`).where('enrolled_count', '=', 0)
      .executeTakeFirstOrThrow(),
  ]);

  // Serie completa con huecos en 0 (días locales consecutivos).
  const byDay = new Map(serieRows.map((r) => [r.d, Number(r.n)]));
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const series: { date: string; value: number }[] = [];
  const nowMs = Date.now();
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = fmt.format(new Date(nowMs - i * 86_400_000));
    series.push({ date: key, value: byDay.get(key) ?? 0 });
  }

  const attCurr = Number(counts.att_curr);
  const attPrev = Number(counts.att_prev);
  const newCurr = Number(counts.new_curr);
  const newPrev = Number(counts.new_prev);
  const occCurr = occ.occ_curr === null ? 0 : Number(occ.occ_curr);
  const occPrev = occ.occ_prev === null ? 0 : Number(occ.occ_prev);
  const retCurrPct = attCurr ? Math.round((Number(ret.ret_curr) / attCurr) * 100) : 0;
  const retPrevPct = attPrev ? Math.round((Number(ret.ret_prev) / attPrev) * 100) : 0;

  const toActivity = (r: NonNullable<typeof upcomingRow>): OverviewActivity => ({
    id: r.id, name: r.name, type: r.type, category: r.category, location: r.location,
    date: (r.date instanceof Date ? r.date : new Date(r.date as unknown as string)).toISOString(),
    capacity: Number(r.capacity), enrolledCount: Number(r.enrolled_count), imageUrl: r.image_url,
  });

  const upcoming = upcomingRow ? toActivity(upcomingRow) : null;

  // Insights contextuales (umbral idéntico a v1).
  const insights: OverviewInsight[] = [];
  if (upcoming && upcoming.capacity > 0) {
    const occPct = (upcoming.enrolledCount / upcoming.capacity) * 100;
    const daysToStart = (new Date(upcoming.date).getTime() - nowMs) / 86_400_000;
    if (occPct < 30 && daysToStart < 14) {
      insights.push({
        type: 'low_enrollment', severity: 'warning', title: 'Baja inscripción próxima',
        message: `"${upcoming.name}" tiene ${upcoming.enrolledCount}/${upcoming.capacity} inscritos a ${Math.max(1, Math.ceil(daysToStart))} día(s) del evento.`,
      });
    } else if (occPct >= 90 && occPct < 100) {
      insights.push({
        type: 'near_full', severity: 'info', title: 'Casi lleno',
        message: `"${upcoming.name}" está al ${Math.round(occPct)}% de capacidad.`,
      });
    }
  }
  const nEmpty = Number(emptyActive.n);
  if (nEmpty > 0) {
    insights.push({
      type: 'empty_activities', severity: 'info', title: 'Actividades sin inscripciones',
      message: nEmpty === 1 ? 'Hay 1 actividad activa sin inscripciones todavía.' : `Hay ${nEmpty} actividades activas sin inscripciones todavía.`,
    });
  }

  return {
    period,
    series,
    attendance: { current: attCurr, previous: attPrev, deltaPct: deltaPct(attCurr, attPrev) },
    newVisitors: { current: newCurr, previous: newPrev, deltaPct: deltaPct(newCurr, newPrev) },
    avgOccupancyPct: { current: occCurr, previous: occPrev, deltaPct: deltaPct(occCurr, occPrev) },
    returnRatePct: { current: retCurrPct, previous: retPrevPct, deltaPct: deltaPct(retCurrPct, retPrevPct) },
    upcoming,
    featured: featuredRow ? { ...toActivity(featuredRow), periodAttendances: Number(featuredRow.n) } : null,
    insights,
  };
}
