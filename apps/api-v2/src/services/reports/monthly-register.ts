// apps/api-v2/src/services/reports/monthly-register.ts · arma el "registro de
// actividades" en el formato del departamento (Registro_Actividades_Culturales):
// una fila por actividad con fecha, ordenada por fecha, con la asistencia =
// PERSONAS reales (check-in + acompañantes; las reservas no cuentan). Sirve al
// registro mensual (`month.xlsx`) y al libro anual (`year.xlsx`) con el mismo
// cargador: el mes es un recorte del año. Read-only, tenant-scoped
// (organization_id es la frontera pre-RLS). Excluye salas permanentes y
// canceladas (`reportableActivity`, la misma regla del PeriodEngine).
//
// TZ: el bucketing de mes/día/semana se hace en la zona del tenant
// (America/Santo_Domingo por defecto), NO en UTC — si no, un evento de las
// 22:00 cerca del borde del mes cae en el mes o el día equivocado. La fecha
// almacenada es timestamptz; la convertimos con `AT TIME ZONE`.

import { sql, type DbClient } from '@contan2/db';
import { ReportError, MAX_REPORT_ROWS } from '../report-data.js';
import { normCategory } from '../category-norm.js';
import { reportableActivity } from './scope.js';
import { programSlug } from '../programs/edition.js';
import { REPORT_TZ as TZ } from './fmt.js';
import { tipoLabel, monthNameEs, PROGRAMA_SIN_CICLO, PROGRAMAS_DEPTO } from './labels.js';

export { TIPO_ORDER, monthNameEs } from './labels.js';

const pad2 = (n: number) => String(n).padStart(2, '0');

// Semana-del-mes determinista (lunes como inicio) sobre el día calendario LOCAL:
// la semana 1 contiene el día 1; avanza en cada lunes. Vocabulario del
// departamento 1–5: los últimos días de un mes que empieza en domingo/sábado
// caerían en una 6.ª semana, que se pliega a la 5.ª.
export function weekOfMonth(year: number, month1: number, day: number): number {
  const firstDow = new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay(); // 0=Dom..6=Sáb
  const offsetMon = (firstDow + 6) % 7; // 0=Lun..6=Dom
  return Math.min(5, Math.ceil((day + offsetMon) / 7));
}

export interface MonthlyRegisterRow {
  no: number;
  date: string; // ISO (mediodía UTC del día local → celda Date en el Excel, sin corrimiento)
  semana: number; // 1–5
  tipo: string; // uno de los 5 tipos del departamento
  programa: string; // ciclo/programa, o "Actividades Especiales" si no tiene
  nombre: string; // activity name
  asistencia: number; // personas reales
}

export interface MonthlyRegisterReport {
  year: number;
  month: number; // 1-12
  monthName: string;
  rows: MonthlyRegisterRow[];
  totalActividades: number;
  totalAsistencia: number;
}

/** Meses del libro + vocabulario completo que alimenta las listas ocultas. */
export interface RegisterBook {
  year: number;
  months: MonthlyRegisterReport[]; // 12 (libro anual) o 1 (registro mensual)
  programas: string[]; // vocabulario de Programa (depto + programas del tenant + ciclos usados)
}

/**
 * Carga el libro del año (`month` omitido → 12 meses, vacíos incluidos) o de un
 * solo mes. Una consulta; el mes de cada fila sale del día LOCAL del tenant.
 */
export async function loadRegisterBook(
  db: DbClient,
  orgId: string,
  year: number,
  month?: number,
): Promise<RegisterBook> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new ReportError(400, 'Año inválido.');
  }
  if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
    throw new ReportError(400, 'Mes inválido (1–12).');
  }
  // Bordes en hora LOCAL del tenant (timestamps naïve): [inicio, fin).
  const m0 = month ?? 1;
  const endY = month === undefined || month === 12 ? year + 1 : year;
  const endM = month === undefined || month === 12 ? 1 : month + 1;
  const localStart = `${year}-${pad2(m0)}-01 00:00:00`;
  const localEnd = `${endY}-${pad2(endM)}-01 00:00:00`;
  // Día calendario local del evento (timestamp naïve en la TZ del tenant).
  const lts = () => sql`(a.date AT TIME ZONE ${sql.lit(TZ)})`;

  const rows = await db
    .selectFrom('activities as a')
    // Solo check-ins reales: las reservas (checked_in_at NULL) no son asistencia. El
    // filtro va en el ON para no perder actividades sin asistencia.
    .leftJoin('attendance as att', (j) =>
      j.onRef('att.activity_id', '=', 'a.id').onRef('att.organization_id', '=', 'a.organization_id')
        .on('att.checked_in_at', 'is not', null),
    )
    .where('a.organization_id', '=', orgId)
    .where(reportableActivity('a'))
    .where(sql<boolean>`${lts()} >= ${localStart}::timestamp`)
    .where(sql<boolean>`${lts()} < ${localEnd}::timestamp`)
    .groupBy(['a.id', 'a.name', 'a.date', 'a.type', 'a.category'])
    .select(['a.id as id', 'a.name as name', 'a.type as type', 'a.category as category'])
    .select(sql<string>`to_char(${lts()}, 'YYYY-MM-DD')`.as('localDate'))
    .select(sql<string>`coalesce(sum(1 + att.companions_children + att.companions_adults), 0)`.as('asistencia'))
    .orderBy(sql`${lts()}`, 'asc')
    .orderBy('a.name', 'asc')
    .execute();

  if (rows.length > MAX_REPORT_ROWS) {
    throw new ReportError(400, `El período tiene ${rows.length} actividades (máx ${MAX_REPORT_ROWS}).`);
  }

  // Programas del tenant → slug→nombre (el dropdown lista nombres sin edición).
  const programs = await db.selectFrom('programs')
    .select(['slug', 'name'])
    .where('organization_id', '=', orgId).where('active', '=', true)
    .orderBy('name', 'asc').execute();
  const progBySlug = new Map(programs.map((p) => [p.slug, p.name]));
  const displayPrograma = (cat: string | null): string => {
    if (!cat || !cat.trim()) return PROGRAMA_SIN_CICLO;
    return progBySlug.get(programSlug(cat)) ?? cat;
  };

  const monthsToBuild = month === undefined ? Array.from({ length: 12 }, (_, i) => i + 1) : [month];
  const byMonth = new Map<number, MonthlyRegisterRow[]>(monthsToBuild.map((m) => [m, []]));
  const usedProgramas: string[] = [];
  for (const r of rows) {
    const [Y, M, D] = String(r.localDate).split('-').map(Number) as [number, number, number];
    const bucket = byMonth.get(M);
    if (!bucket) continue;
    const programa = displayPrograma(r.category);
    usedProgramas.push(programa);
    bucket.push({
      no: bucket.length + 1,
      // Mediodía UTC del día local: al escribir la celda Date, ningún corrimiento
      // de TZ del proceso/Excel la mueve de día.
      date: new Date(Date.UTC(Y, M - 1, D, 12, 0, 0)).toISOString(),
      semana: weekOfMonth(Y, M, D),
      tipo: tipoLabel(String(r.type)),
      programa,
      nombre: r.name,
      asistencia: Number(r.asistencia),
    });
  }

  // Vocabulario completo de Programa, sin duplicados (normalizado sin acentos/mayúsculas).
  const seen = new Set<string>();
  const programas: string[] = [];
  for (const p of [...PROGRAMAS_DEPTO, ...programs.map((x) => x.name), ...usedProgramas]) {
    const k = normCategory(p);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    programas.push(p);
  }

  return {
    year,
    months: monthsToBuild.map((m) => {
      const mrows = byMonth.get(m)!;
      return {
        year,
        month: m,
        monthName: monthNameEs(m),
        rows: mrows,
        totalActividades: mrows.length,
        totalAsistencia: mrows.reduce((a, r) => a + r.asistencia, 0),
      };
    }),
    programas,
  };
}
