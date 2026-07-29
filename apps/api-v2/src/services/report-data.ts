// apps/api-v2/src/services/report-data.ts · agregación de datos para reportes.
//
// Read-only, tenant-scoped (organization_id es la frontera pre-RLS). Valida el
// rango de fechas y aplica una COTA DURA de filas: si el período tiene más
// actividades que el máximo, devuelve 400 pidiendo acotar (nunca trunca en
// silencio — para datasets enormes el camino futuro es CSV en streaming / jobs).

import { sql, type DbClient } from '@contan2/db';
import { normCategory, normCategorySql } from './category-norm.js';

export const MAX_REPORT_RANGE_DAYS = 366;
export const MAX_REPORT_ROWS = 5000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export class ReportError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ReportError';
  }
}

export interface ReportRange {
  from: string; // YYYY-MM-DD (inclusive)
  to: string; // YYYY-MM-DD (inclusive)
  fromDate: Date; // 00:00:00Z del día `from`
  toExclusive: Date; // 00:00:00Z del día siguiente a `to`
}

// Parsea/valida from y to (YYYY-MM-DD). El rango es [from 00:00Z, to+1día 00:00Z).
export function parseRange(fromRaw: unknown, toRaw: unknown): ReportRange {
  const from = String(fromRaw ?? '');
  const to = String(toRaw ?? '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw new ReportError(400, 'Rango inválido: usá from y to en formato YYYY-MM-DD.');
  }
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new ReportError(400, 'Rango inválido: fechas no válidas.');
  }
  if (fromDate.getTime() > toDate.getTime()) {
    throw new ReportError(400, 'Rango inválido: "from" debe ser anterior o igual a "to".');
  }
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1;
  if (days > MAX_REPORT_RANGE_DAYS) {
    throw new ReportError(400, `Rango demasiado amplio (máx ${MAX_REPORT_RANGE_DAYS} días). Acotá el período.`);
  }
  return { from, to, fromDate, toExclusive: new Date(toDate.getTime() + DAY_MS) };
}

export interface AttendanceByActivityRow {
  activityId: string;
  name: string;
  date: string; // ISO
  location: string;
  category: string | null;
  status: string;
  capacity: number;
  enrolledCount: number;
  attendances: number; // filas de asistencia (check-ins)
  people: number; // 1 + acompañantes niños por asistencia
  anonymous: number; // asistencias anónimas (+1 sin credencial)
  occupancyPct: number; // people / capacity
}

export interface AttendanceByActivityReport {
  period: { from: string; to: string };
  totals: { activities: number; attendances: number; people: number; anonymous: number; capacity: number; occupancyPct: number };
  rows: AttendanceByActivityRow[];
}

const pct = (people: number, capacity: number) => (capacity > 0 ? Math.round((people / capacity) * 100) : 0);

export async function attendanceByActivity(
  db: DbClient,
  orgId: string,
  range: ReportRange,
  category?: string, // filtro opcional por categoría/ciclo (ej. "5to ciclo de cine dominicano")
): Promise<AttendanceByActivityReport> {
  // Cota dura: contamos primero (barato) para no materializar un dataset enorme.
  // El filtro por categoría/ciclo compara NORMALIZADO (minúsculas, sin
  // acentos, espacios colapsados): "Cine Clásico" matchea "cine clasico".
  const categoryNorm = category ? normCategory(category) : null;
  const categoryWhere = sql<boolean>`${normCategorySql(sql`category`)} = ${categoryNorm ?? ''}`;
  let countQ = db
    .selectFrom('activities')
    .select(db.fn.countAll<string>().as('n'))
    .where('organization_id', '=', orgId)
    .where('date', '>=', range.fromDate)
    .where('date', '<', range.toExclusive);
  if (categoryNorm) countQ = countQ.where(categoryWhere);
  const countRow = await countQ.executeTakeFirstOrThrow();
  if (Number(countRow.n) > MAX_REPORT_ROWS) {
    throw new ReportError(400, `El período tiene ${countRow.n} actividades (máx ${MAX_REPORT_ROWS}). Acotá el rango.`);
  }

  let rowsQ = db
    .selectFrom('activities as a')
    .leftJoin('attendance as att', (j) =>
      j.onRef('att.activity_id', '=', 'a.id').onRef('att.organization_id', '=', 'a.organization_id'),
    )
    .where('a.organization_id', '=', orgId)
    .where('a.date', '>=', range.fromDate)
    .where('a.date', '<', range.toExclusive);
  if (categoryNorm) rowsQ = rowsQ.where(sql<boolean>`${normCategorySql(sql`a.category`)} = ${categoryNorm}`);
  const rows = await rowsQ
    .groupBy(['a.id', 'a.name', 'a.date', 'a.location', 'a.category', 'a.status', 'a.capacity', 'a.enrolled_count'])
    .select([
      'a.id as activityId',
      'a.name as name',
      'a.date as date',
      'a.location as location',
      'a.category as category',
      'a.status as status',
      'a.capacity as capacity',
      'a.enrolled_count as enrolledCount',
    ])
    .select((eb) => eb.fn.count('att.id').as('attendances'))
    .select(sql<string>`coalesce(sum(1 + att.companions_children + att.companions_adults), 0)`.as('people'))
    .select(sql<string>`count(att.id) filter (where att.anonymous)`.as('anonymous'))
    .orderBy('a.date', 'desc')
    .execute();

  const mapped: AttendanceByActivityRow[] = rows.map((r) => {
    const capacity = Number(r.capacity);
    const people = Number(r.people);
    const d = r.date instanceof Date ? r.date : new Date(r.date as unknown as string);
    return {
      activityId: r.activityId,
      name: r.name,
      date: d.toISOString(),
      location: r.location,
      category: r.category,
      status: String(r.status),
      capacity,
      enrolledCount: Number(r.enrolledCount),
      attendances: Number(r.attendances),
      people,
      anonymous: Number(r.anonymous),
      occupancyPct: pct(people, capacity),
    };
  });

  const totals = mapped.reduce(
    (acc, r) => {
      acc.activities += 1;
      acc.attendances += r.attendances;
      acc.people += r.people;
      acc.anonymous += r.anonymous;
      acc.capacity += r.capacity;
      return acc;
    },
    { activities: 0, attendances: 0, people: 0, anonymous: 0, capacity: 0, occupancyPct: 0 },
  );
  totals.occupancyPct = pct(totals.people, totals.capacity);

  return { period: { from: range.from, to: range.to }, totals, rows: mapped };
}
