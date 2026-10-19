// apps/api-v2/src/services/reports/period-engine.ts · UN SOLO motor de período.
//
// Calcula, para un rango [from, to] (días locales del tenant) + filtros (tipos,
// ciclos), TODO lo que muestran el dashboard, el Excel, el PDF y el Asistente:
// KPIs (actividades, registros, PERSONAS, visitantes únicos, ocupación), serie
// diaria, por tipo, por mes, por hora, por día de la semana, actividades del
// período, nuevos vs recurrentes y top de visitantes (sin correo ni teléfono),
// más los mismos agregados del período anterior (P4: el mismo tramo del mes
// anterior; ver previousPeriodYmd). Ninguna otra pieza vuelve a sumar a mano.
//
// Definiciones (decisión del dueño P2 + auditoría 2026-10-19):
//  · registros (`attendances`) = check-ins reales (checked_in_at no nulo; las
//    reservas no cuentan). Anónimos incluidos.
//  · personas (`people`) = por check-in, 1 + acompañantes niños + adultos.
//    Es la cifra principal; los registros son el dato secundario.
//  · ocupación = personas / aforo de las actividades del período (alcance en
//    scope.ts: sin salas permanentes ni canceladas).
//  · primera visita = el check-in de menor fecha de actividad del usuario en
//    toda la historia ALCANZABLE (mismo alcance y mismos filtros).
//  · delta de ocupación = diferencia en PUNTOS porcentuales; el resto, en %.

import { sql, type DbClient } from '@contan2/db';
import { type ReportRange } from '../report-data.js';
import { normCategory, normCategorySql } from '../category-norm.js';
import { REPORT_TZ, monthKeyInTz, ymdAddDays, zonedMidnight } from './fmt.js';
import { occupancyPct } from './metrics.js';
import { reportableActivity, REPORTABLE_ACTIVITY_RAW } from './scope.js';
import { previousPeriodYmd } from './range.js';
import { TYPE_LABELS } from './labels.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_USERS = 20;
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export { TYPE_LABELS };

export interface PeriodFilters { types?: string[]; categories?: string[] }

export interface PeriodKpis {
  activities: number;
  attendances: number; // registros (check-ins)
  people: number; // personas (check-in + acompañantes)
  uniqueVisitors: number;
  capacity: number; // aforo total de las actividades del período
  occupancyPct: number; // personas / aforo
}

export interface PeriodActivityRow {
  id: string; name: string; type: string; typeLabel: string; date: string; // ISO
  location: string; category: string | null; status: string;
  capacity: number; enrolledCount: number; imageUrl: string | null;
  attendances: number; people: number; occupancyPct: number;
}

export interface PeriodAgg {
  kpis: PeriodKpis;
  /** Actividades del período, por fecha ascendente. */
  activities: PeriodActivityRow[];
  byType: Array<{ type: string; label: string; activities: number; attendances: number; people: number; pct: number }>;
  byMonth: Array<{ key: string; label: string; activities: number; attendances: number; people: number }>;
  /** Un elemento por día del rango (fecha de la actividad, día local). */
  daily: Array<{ date: string; label: string; attendances: number; people: number; visitors: number; activities: number }>;
  byHour: Array<{ hour: number; attendances: number; people: number }>;
  byWeekday: Array<{ weekday: number; attendances: number; people: number }>;
  newVsReturning: { nuevos: number; recurrentes: number };
  /** Sin correo ni teléfono (el informe circula fuera del centro). */
  topUsers: Array<{ code: string; firstName: string; lastName: string; visitsInPeriod: number; totalVisits: number }>;
}

export interface PeriodDeltas {
  activities: number | null;
  attendances: number | null;
  people: number | null;
  uniqueVisitors: number | null;
  /** En PUNTOS porcentuales (actual - anterior); null si el período anterior no tiene aforo. */
  occupancyPct: number | null;
}

export interface PeriodEngineResult {
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  current: PeriodAgg;
  previous: PeriodAgg;
  deltas: PeriodDeltas;
}

export const deltaPct = (cur: number, prev: number): number | null => (prev <= 0 ? null : Math.round(((cur - prev) / prev) * 100));

const hasTypes = (types?: string[]): types is string[] => Array.isArray(types) && types.length > 0;
const fmtDayLabel = (ymd: string): string => {
  const dt = new Date(`${ymd}T00:00:00Z`);
  return `${dt.getUTCDate()} ${MONTHS_ES[dt.getUTCMonth()]}`;
};
function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString('es-DO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Rango del período anterior (P4) como ReportRange. */
export function previousReportRange(r: { from: string; to: string }): ReportRange {
  const { from, to } = previousPeriodYmd(r.from, r.to);
  return { from, to, fromDate: zonedMidnight(from), toExclusive: zonedMidnight(ymdAddDays(to, 1)) };
}

export async function periodEngine(
  db: DbClient,
  orgId: string,
  range: ReportRange,
  filters: PeriodFilters = {},
): Promise<PeriodEngineResult> {
  const { types } = filters;
  // Filtro por ciclo NORMALIZADO (minúsculas, sin acentos, espacios colapsados).
  const cats = Array.isArray(filters.categories) && filters.categories.length > 0
    ? filters.categories.map((c) => normCategory(c)).filter(Boolean)
    : null;
  const hasCats = cats !== null && cats.length > 0;
  const catCond = () => sql<boolean>`${normCategorySql(sql`a.category`)} in (${sql.join(cats!)})`;
  const peopleExpr = sql<string>`coalesce(sum(1 + att.companions_children + att.companions_adults), 0)`;

  async function aggregate(r: ReportRange): Promise<PeriodAgg> {
    // 1) Actividades del período con registros y personas (un GROUP BY por actividad).
    const actRows = await db
      .selectFrom('activities as a')
      // Asistencia = check-in real: el filtro va en el ON para no perder actividades sin asistentes.
      .leftJoin('attendance as att', (j) => j.onRef('att.activity_id', '=', 'a.id').onRef('att.organization_id', '=', 'a.organization_id').on('att.checked_in_at', 'is not', null))
      .where('a.organization_id', '=', orgId)
      .where(reportableActivity('a'))
      .where('a.date', '>=', r.fromDate)
      .where('a.date', '<', r.toExclusive)
      .$if(hasTypes(types), (qb) => qb.where('a.type', 'in', types!))
      .$if(hasCats, (qb) => qb.where(catCond()))
      .groupBy('a.id')
      .orderBy('a.date', 'asc')
      .orderBy('a.id', 'asc')
      .select(['a.id as id', 'a.type as type', 'a.name as name', 'a.capacity as capacity', 'a.image_url as imageUrl',
        'a.date as date', 'a.location as location', 'a.category as category', 'a.status as status', 'a.enrolled_count as enrolledCount'])
      .select((eb) => eb.fn.count('att.id').as('attendances'))
      .select(peopleExpr.as('people'))
      .execute();

    const activities: PeriodActivityRow[] = actRows.map((x) => {
      const people = Number(x.people);
      return {
        id: x.id, name: x.name, type: x.type, typeLabel: TYPE_LABELS[x.type] ?? x.type,
        date: new Date(x.date as unknown as string).toISOString(),
        location: x.location, category: x.category, status: x.status,
        capacity: Number(x.capacity), enrolledCount: Number(x.enrolledCount), imageUrl: x.imageUrl,
        attendances: Number(x.attendances), people, occupancyPct: occupancyPct(people, Number(x.capacity)),
      };
    });

    // 2) Visitas por visitante identificado (únicos + top, un solo GROUP BY).
    const visitRows = await db
      .selectFrom('attendance as att')
      .innerJoin('activities as a', 'a.id', 'att.activity_id')
      .where('att.organization_id', '=', orgId)
      .where(reportableActivity('a'))
      .where('att.user_id', 'is not', null)
      .where('att.checked_in_at', 'is not', null)
      .where('a.date', '>=', r.fromDate)
      .where('a.date', '<', r.toExclusive)
      .$if(hasTypes(types), (qb) => qb.where('a.type', 'in', types!))
      .$if(hasCats, (qb) => qb.where(catCond()))
      .groupBy('att.user_id')
      .select(['att.user_id as userId'])
      .select(sql<string>`count(att.id)`.as('n'))
      .execute();
    const uniqueVisitors = visitRows.length;

    // 3) Por DÍA local del tenant (fecha de la actividad): registros, personas, visitantes, actividades.
    const dayRows = await db
      .selectFrom('attendance as att')
      .innerJoin('activities as a', 'a.id', 'att.activity_id')
      .where('att.organization_id', '=', orgId)
      .where(reportableActivity('a'))
      .where('att.checked_in_at', 'is not', null)
      .where('a.date', '>=', r.fromDate)
      .where('a.date', '<', r.toExclusive)
      .$if(hasTypes(types), (qb) => qb.where('a.type', 'in', types!))
      .$if(hasCats, (qb) => qb.where(catCond()))
      .select([
        sql<string>`to_char(date_trunc('day', a.date AT TIME ZONE ${sql.lit(REPORT_TZ)}), 'YYYY-MM-DD')`.as('d'),
        sql<string>`count(att.id)`.as('att'),
        peopleExpr.as('people'),
        sql<string>`count(distinct att.user_id)`.as('visitors'),
        sql<string>`count(distinct a.id)`.as('activities'),
      ])
      .groupBy(sql`date_trunc('day', a.date AT TIME ZONE ${sql.lit(REPORT_TZ)})`)
      .execute();
    const dayMap = new Map(dayRows.map((x) => [x.d, x]));
    const nDays = Math.round((Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / DAY_MS) + 1;
    const daily = Array.from({ length: nDays }, (_, i) => {
      const date = ymdAddDays(r.from, i);
      const x = dayMap.get(date);
      return {
        date, label: fmtDayLabel(date),
        attendances: Number(x?.att ?? 0), people: Number(x?.people ?? 0),
        visitors: Number(x?.visitors ?? 0), activities: Number(x?.activities ?? 0),
      };
    });

    // 4) Por HORA y por DÍA DE LA SEMANA del check-in.
    const hwRows = await db
      .selectFrom('attendance as att')
      .innerJoin('activities as a', 'a.id', 'att.activity_id')
      .where('att.organization_id', '=', orgId)
      .where(reportableActivity('a'))
      .where('att.checked_in_at', 'is not', null)
      .where('a.date', '>=', r.fromDate)
      .where('a.date', '<', r.toExclusive)
      .$if(hasTypes(types), (qb) => qb.where('a.type', 'in', types!))
      .$if(hasCats, (qb) => qb.where(catCond()))
      .select([
        sql<number>`extract(hour from att.checked_in_at AT TIME ZONE ${sql.lit(REPORT_TZ)})`.as('hour'),
        sql<number>`extract(dow from att.checked_in_at AT TIME ZONE ${sql.lit(REPORT_TZ)})`.as('dow'),
        sql<string>`count(att.id)`.as('n'),
        peopleExpr.as('people'),
      ])
      .groupBy([sql`extract(hour from att.checked_in_at AT TIME ZONE ${sql.lit(REPORT_TZ)})`, sql`extract(dow from att.checked_in_at AT TIME ZONE ${sql.lit(REPORT_TZ)})`])
      .execute();
    const hours = new Map<number, { attendances: number; people: number }>();
    const dows = new Map<number, { attendances: number; people: number }>();
    for (const x of hwRows) {
      const n = Number(x.n), p = Number(x.people);
      const h = hours.get(Number(x.hour)) ?? { attendances: 0, people: 0 };
      h.attendances += n; h.people += p; hours.set(Number(x.hour), h);
      const d = dows.get(Number(x.dow)) ?? { attendances: 0, people: 0 };
      d.attendances += n; d.people += p; dows.set(Number(x.dow), d);
    }
    const byHour = [...hours.entries()].map(([hour, v]) => ({ hour, ...v })).sort((a, b) => a.hour - b.hour);
    const byWeekday = Array.from({ length: 7 }, (_, weekday) => ({ weekday, ...(dows.get(weekday) ?? { attendances: 0, people: 0 }) }));

    // 5) Nuevos vs recurrentes: de los visitantes del período, cuántos tuvieron su
    //    PRIMERA visita (de toda la historia alcanzable y filtrada) dentro de él.
    const typeClause = hasTypes(types) ? sql`and a.type in (${sql.join(types.map((t) => sql`${t}`))})` : sql``;
    const catClause = hasCats ? sql`and ${normCategorySql(sql`a.category`)} in (${sql.join(cats!)})` : sql``;
    const nvrRes = await sql<{ nuevos: string; total: string }>`
      select
        count(*) filter (where u.first_date >= ${r.fromDate}) as nuevos,
        count(*) as total
      from (
        select att.user_id,
               min(a.date) as first_date,
               bool_or(a.date >= ${r.fromDate} and a.date < ${r.toExclusive}) as in_period
        from attendance att
        join activities a on a.id = att.activity_id
        where att.organization_id = ${orgId} and ${REPORTABLE_ACTIVITY_RAW} and att.user_id is not null and att.checked_in_at is not null ${typeClause} ${catClause}
        group by att.user_id
      ) u
      where u.in_period
    `.execute(db);
    const nvrRow = nvrRes.rows[0];
    const nvrTotal = Number(nvrRow?.total ?? 0), nuevos = Number(nvrRow?.nuevos ?? 0);

    // 6) Top de visitantes (hidratados en UN query; sin correo ni teléfono).
    const topPairs = [...visitRows]
      .map((v) => [v.userId as string, Number(v.n)] as const)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP_USERS);
    const topUsers: PeriodAgg['topUsers'] = [];
    if (topPairs.length > 0) {
      const users = await db.selectFrom('users')
        .select(['id', 'code', 'first_name', 'last_name', 'visit_count'])
        .where('organization_id', '=', orgId)
        .where('id', 'in', topPairs.map(([uid]) => uid))
        .execute();
      const byId = new Map(users.map((u) => [u.id, u]));
      for (const [uid, n] of topPairs) {
        const u = byId.get(uid);
        if (!u) continue;
        topUsers.push({ code: u.code, firstName: u.first_name, lastName: u.last_name, visitsInPeriod: n, totalVisits: u.visit_count });
      }
    }

    // Derivados en memoria desde las actividades (una sola fuente de sumas).
    let attendances = 0, people = 0, capacity = 0;
    const typeMap = new Map<string, PeriodAgg['byType'][number]>();
    const monthMap = new Map<string, PeriodAgg['byMonth'][number]>();
    for (const a of activities) {
      attendances += a.attendances; people += a.people; capacity += a.capacity;
      const t = typeMap.get(a.type) ?? { type: a.type, label: a.typeLabel, activities: 0, attendances: 0, people: 0, pct: 0 };
      t.activities += 1; t.attendances += a.attendances; t.people += a.people; typeMap.set(a.type, t);
      const mk = monthKeyInTz(a.date);
      const m = monthMap.get(mk) ?? { key: mk, label: monthLabel(mk), activities: 0, attendances: 0, people: 0 };
      m.activities += 1; m.attendances += a.attendances; m.people += a.people; monthMap.set(mk, m);
    }
    const byType = [...typeMap.values()]
      .map((t) => ({ ...t, pct: attendances > 0 ? Math.round((t.attendances / attendances) * 100) : 0 }))
      .sort((a, b) => b.attendances - a.attendances || b.people - a.people);
    const byMonth = [...monthMap.values()].sort((a, b) => a.key.localeCompare(b.key));

    return {
      kpis: { activities: activities.length, attendances, people, uniqueVisitors, capacity, occupancyPct: occupancyPct(people, capacity) },
      activities, byType, byMonth, daily, byHour, byWeekday,
      newVsReturning: { nuevos, recurrentes: Math.max(0, nvrTotal - nuevos) },
      topUsers,
    };
  }

  const prevR = previousReportRange(range);
  const [current, previous] = await Promise.all([aggregate(range), aggregate(prevR)]);

  const c = current.kpis, p = previous.kpis;
  return {
    range: { from: range.from, to: range.to },
    previousRange: { from: prevR.from, to: prevR.to },
    current,
    previous,
    deltas: {
      activities: deltaPct(c.activities, p.activities),
      attendances: deltaPct(c.attendances, p.attendances),
      people: deltaPct(c.people, p.people),
      uniqueVisitors: deltaPct(c.uniqueVisitors, p.uniqueVisitors),
      occupancyPct: p.capacity > 0 ? c.occupancyPct - p.occupancyPct : null,
    },
  };
}
