// apps/api-v2/src/services/reports/period-summary.ts · agregados del dashboard
// ejecutivo de Reportes, todo desde datos REALES (activities + attendance):
// KPIs + delta vs período anterior, serie diaria (este vs anterior), distribución
// por tipo, top actividades, nuevos vs recurrentes, asistencias por hora y por
// día de la semana. El período se define por activities.date ∈ [from, to].
// Filtro opcional por tipos de actividad.

import { sql, type DbClient } from '@contan2/db';
import { type ReportRange } from '../report-data.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const pct = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 100) : 0);
const deltaPct = (cur: number, prev: number): number | null => (prev <= 0 ? null : Math.round(((cur - prev) / prev) * 100));

// Período inmediatamente anterior, de la misma duración.
export function previousRange(r: ReportRange): ReportRange {
  const days = Math.round((r.toExclusive.getTime() - r.fromDate.getTime()) / DAY_MS);
  const toExclusive = new Date(r.fromDate.getTime()); // exclusivo = inicio del actual
  const fromDate = new Date(r.fromDate.getTime() - days * DAY_MS);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(fromDate), to: iso(new Date(toExclusive.getTime() - DAY_MS)), fromDate, toExclusive };
}

export interface PeriodSummary {
  range: { from: string; to: string };
  prevRange: { from: string; to: string };
  kpis: { activities: number; attendances: number; uniqueVisitors: number; occupancyPct: number };
  prev: { activities: number; attendances: number; uniqueVisitors: number; occupancyPct: number };
  deltas: { activities: number | null; attendances: number | null; uniqueVisitors: number | null; occupancyPct: number | null };
  byType: Array<{ type: string; label: string; attendances: number; pct: number }>;
  topActivities: Array<{ id: string; name: string; type: string; attendances: number; occupancyPct: number }>;
  newVsReturning: { nuevos: number; recurrentes: number };
  daily: Array<{ label: string; current: number; previous: number }>;
  byHour: Array<{ hour: number; count: number }>;
  byWeekday: Array<{ weekday: number; count: number }>;
}

const TYPE_LABELS: Record<string, string> = {
  exposicion: 'Exposición', concierto: 'Concierto', cine: 'Cine', taller: 'Taller',
  teatro: 'Teatro', conferencia: 'Conferencia', otro: 'Otro',
};

// Filtra activities por tipo si se pidió (acotado al enum por el contrato).
const hasTypes = (types?: string[]): types is string[] => Array.isArray(types) && types.length > 0;

export async function periodSummary(
  db: DbClient,
  orgId: string,
  range: ReportRange,
  types?: string[],
): Promise<PeriodSummary> {
  const prevR = previousRange(range);

  // Totales (activities/asistencias/aforo) por rango — un GROUP BY por actividad.
  async function totals(r: ReportRange) {
    const rows = await db
      .selectFrom('activities as a')
      .leftJoin('attendance as att', (j) => j.onRef('att.activity_id', '=', 'a.id').onRef('att.organization_id', '=', 'a.organization_id'))
      .where('a.organization_id', '=', orgId)
      .where('a.date', '>=', r.fromDate)
      .where('a.date', '<', r.toExclusive)
      .$if(hasTypes(types), (qb) => qb.where('a.type', 'in', types!))
      .groupBy(['a.id', 'a.type', 'a.name', 'a.capacity'])
      .select(['a.id as id', 'a.type as type', 'a.name as name', 'a.capacity as capacity'])
      .select((eb) => eb.fn.count('att.id').as('attendances'))
      .select(sql<string>`coalesce(sum(1 + att.companions_children + att.companions_adults), 0)`.as('people'))
      .execute();
    let attendances = 0, people = 0, capacity = 0;
    for (const x of rows) { attendances += Number(x.attendances); people += Number(x.people); capacity += Number(x.capacity); }
    return { rows, activities: rows.length, attendances, people, capacity, occupancyPct: pct(people, capacity) };
  }

  // Visitantes únicos (identificados) por rango.
  async function uniqueVisitors(r: ReportRange) {
    const row = await db
      .selectFrom('attendance as att')
      .innerJoin('activities as a', 'a.id', 'att.activity_id')
      .where('att.organization_id', '=', orgId)
      .where('att.user_id', 'is not', null)
      .where('a.date', '>=', r.fromDate)
      .where('a.date', '<', r.toExclusive)
      .$if(hasTypes(types), (qb) => qb.where('a.type', 'in', types!))
      .select(sql<string>`count(distinct att.user_id)`.as('n'))
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  // Asistencias por DÍA (date_trunc en UTC) → mapa fecha→count.
  async function daily(r: ReportRange) {
    const rows = await db
      .selectFrom('attendance as att')
      .innerJoin('activities as a', 'a.id', 'att.activity_id')
      .where('att.organization_id', '=', orgId)
      .where('a.date', '>=', r.fromDate)
      .where('a.date', '<', r.toExclusive)
      .$if(hasTypes(types), (qb) => qb.where('a.type', 'in', types!))
      .select([sql<string>`to_char(date_trunc('day', a.date), 'YYYY-MM-DD')`.as('d'), sql<string>`count(att.id)`.as('n')])
      .groupBy(sql`date_trunc('day', a.date)`)
      .execute();
    const m = new Map<string, number>();
    for (const x of rows) m.set(x.d, Number(x.n));
    return m;
  }

  // Asistencias por HORA del check-in y por DÍA DE SEMANA (sobre checked_in_at).
  async function byHourWeekday(r: ReportRange) {
    const rows = await db
      .selectFrom('attendance as att')
      .innerJoin('activities as a', 'a.id', 'att.activity_id')
      .where('att.organization_id', '=', orgId)
      .where('att.checked_in_at', 'is not', null)
      .where('a.date', '>=', r.fromDate)
      .where('a.date', '<', r.toExclusive)
      .$if(hasTypes(types), (qb) => qb.where('a.type', 'in', types!))
      .select([
        sql<number>`extract(hour from att.checked_in_at)`.as('hour'),
        sql<number>`extract(dow from att.checked_in_at)`.as('dow'),
        sql<string>`count(att.id)`.as('n'),
      ])
      .groupBy([sql`extract(hour from att.checked_in_at)`, sql`extract(dow from att.checked_in_at)`])
      .execute();
    const hours = new Map<number, number>(), days = new Map<number, number>();
    for (const x of rows) {
      const h = Number(x.hour), d = Number(x.dow), n = Number(x.n);
      hours.set(h, (hours.get(h) ?? 0) + n);
      days.set(d, (days.get(d) ?? 0) + n);
    }
    return { hours, days };
  }

  // Nuevos vs recurrentes: de los usuarios con asistencia EN el período, cuántos
  // tuvieron su PRIMERA asistencia (de toda la historia filtrada) dentro de él.
  async function newVsReturning(r: ReportRange) {
    const typeClause = hasTypes(types) ? sql`and a.type in (${sql.join(types.map((t) => sql`${t}`))})` : sql``;
    const res = await sql<{ nuevos: string; total: string }>`
      select
        count(*) filter (where u.first_date >= ${r.fromDate}) as nuevos,
        count(*) as total
      from (
        select att.user_id,
               min(a.date) as first_date,
               bool_or(a.date >= ${r.fromDate} and a.date < ${r.toExclusive}) as in_period
        from attendance att
        join activities a on a.id = att.activity_id
        where att.organization_id = ${orgId} and att.user_id is not null ${typeClause}
        group by att.user_id
      ) u
      where u.in_period
    `.execute(db);
    const row = res.rows[0];
    const total = Number(row?.total ?? 0), nuevos = Number(row?.nuevos ?? 0);
    return { nuevos, recurrentes: Math.max(0, total - nuevos) };
  }

  const [cur, prev, curUniq, prevUniq, curDaily, prevDaily, hw, nvr] = await Promise.all([
    totals(range), totals(prevR), uniqueVisitors(range), uniqueVisitors(prevR),
    daily(range), daily(prevR), byHourWeekday(range), newVsReturning(range),
  ]);

  // byType (del período actual).
  const byTypeMap = new Map<string, number>();
  for (const x of cur.rows) byTypeMap.set(x.type, (byTypeMap.get(x.type) ?? 0) + Number(x.attendances));
  const byType = [...byTypeMap.entries()]
    .map(([type, attendances]) => ({ type, label: TYPE_LABELS[type] ?? type, attendances, pct: pct(attendances, cur.attendances) }))
    .sort((a, b) => b.attendances - a.attendances);

  // topActivities (del período actual, por asistencias).
  const topActivities = [...cur.rows]
    .map((x) => ({ id: x.id, name: x.name, type: x.type, attendances: Number(x.attendances), occupancyPct: pct(Number(x.people), Number(x.capacity)) }))
    .sort((a, b) => b.attendances - a.attendances)
    .slice(0, 8);

  // Serie diaria alineada por índice (día 0..N-1 de cada período).
  const days = Math.round((range.toExclusive.getTime() - range.fromDate.getTime()) / DAY_MS);
  const dayKey = (base: Date, i: number) => new Date(base.getTime() + i * DAY_MS).toISOString().slice(0, 10);
  const fmtLabel = (d: string) => { const dt = new Date(`${d}T00:00:00Z`); return `${dt.getUTCDate()} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][dt.getUTCMonth()]}`; };
  const dailySeries = Array.from({ length: days }, (_, i) => ({
    label: fmtLabel(dayKey(range.fromDate, i)),
    current: curDaily.get(dayKey(range.fromDate, i)) ?? 0,
    previous: prevDaily.get(dayKey(prevR.fromDate, i)) ?? 0,
  }));

  const byHour = [...hw.hours.entries()].map(([hour, count]) => ({ hour, count })).sort((a, b) => a.hour - b.hour);
  const byWeekday = Array.from({ length: 7 }, (_, d) => ({ weekday: d, count: hw.days.get(d) ?? 0 }));

  return {
    range: { from: range.from, to: range.to },
    prevRange: { from: prevR.from, to: prevR.to },
    kpis: { activities: cur.activities, attendances: cur.attendances, uniqueVisitors: curUniq, occupancyPct: cur.occupancyPct },
    prev: { activities: prev.activities, attendances: prev.attendances, uniqueVisitors: prevUniq, occupancyPct: prev.occupancyPct },
    deltas: {
      activities: deltaPct(cur.activities, prev.activities),
      attendances: deltaPct(cur.attendances, prev.attendances),
      uniqueVisitors: deltaPct(curUniq, prevUniq),
      occupancyPct: deltaPct(cur.occupancyPct, prev.occupancyPct),
    },
    byType,
    topActivities,
    newVsReturning: nvr,
    daily: dailySeries,
    byHour,
    byWeekday,
  };
}
