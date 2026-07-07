// apps/api-v2/src/services/reports/monthly-register.ts · arma el "registro
// mensual" en el formato del departamento (Cine/Teatro): una fila por actividad
// con fecha del mes, ordenada por fecha, con la asistencia = check-ins reales
// (headcount, incluye acompañantes). Read-only, tenant-scoped (organization_id
// es la frontera pre-RLS). Excluye salas permanentes (no son eventos con fecha).
//
// TZ: el bucketing de mes/día/semana se hace en la zona del tenant
// (America/Santo_Domingo por defecto, igual que la puerta y el check-in), NO en
// UTC — si no, un evento de las 22:00 cerca del borde del mes cae en el mes o el
// día equivocado. La fecha almacenada es timestamptz; la convertimos con
// `AT TIME ZONE` para obtener el día calendario local.

import { sql, type DbClient } from '@contan2/db';
import { ReportError, MAX_REPORT_ROWS } from '../report-data.js';

const TZ = process.env.CHECKIN_TZ ?? 'America/Santo_Domingo';

// Mapa de los 7 `type` de v2 al vocabulario de 5 del departamento.
const TIPO_LABEL: Record<string, string> = {
  cine: 'Cine',
  teatro: 'Teatro',
  taller: 'Talleres',
  conferencia: 'Charlas',
  tertulia: 'Charlas', // tertulia = conversación/charla en el vocabulario del depto
  concierto: 'Otras Actividades',
  exposicion: 'Otras Actividades',
  visita_guiada: 'Otras Actividades',
  cuentacuentos: 'Otras Actividades',
  otro: 'Otras Actividades',
};
// Orden estable para el resumen "por tipo".
export const TIPO_ORDER = ['Cine', 'Teatro', 'Talleres', 'Charlas', 'Otras Actividades'] as const;
const tipoLabel = (t: string) => TIPO_LABEL[t] ?? 'Otras Actividades';

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
export const monthNameEs = (m: number) => MONTHS_ES[m - 1] ?? '';

const pad2 = (n: number) => String(n).padStart(2, '0');

// Semana-del-mes determinista (lunes como inicio) sobre el día calendario LOCAL:
// la semana 1 contiene el día 1; avanza en cada lunes. Reemplaza la numeración
// manual e irregular del Excel.
function weekOfMonth(year: number, month1: number, day: number): number {
  const firstDow = new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay(); // 0=Dom..6=Sáb
  const offsetMon = (firstDow + 6) % 7; // 0=Lun..6=Dom
  return Math.ceil((day + offsetMon) / 7);
}

export interface MonthlyRegisterRow {
  no: number;
  date: string; // ISO (mediodía UTC del día local → celda Date en el Excel, sin corrimiento)
  semana: number;
  tipo: string; // etiqueta de 5
  programa: string; // category ?? ''
  nombre: string; // activity name
  asistencia: number; // headcount real
}

export interface MonthlySummaryRow { label: string; actividades: number; asistencia: number }

export interface MonthlyRegisterReport {
  year: number;
  month: number; // 1-12
  monthName: string;
  rows: MonthlyRegisterRow[];
  totalActividades: number;
  totalAsistencia: number;
  porTipo: MonthlySummaryRow[];
  porPrograma: MonthlySummaryRow[];
}

export async function monthlyRegister(
  db: DbClient,
  orgId: string,
  year: number,
  month: number,
): Promise<MonthlyRegisterReport> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new ReportError(400, 'Año inválido.');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ReportError(400, 'Mes inválido (1–12).');
  }
  // Bordes del mes en hora LOCAL del tenant (timestamps naïve): [1ro 00:00, 1ro del mes siguiente 00:00).
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const localStart = `${year}-${pad2(month)}-01 00:00:00`;
  const localEnd = `${nextY}-${pad2(nextM)}-01 00:00:00`;
  // Día calendario local del evento (timestamp naïve en la TZ del tenant).
  const lts = () => sql`(a.date AT TIME ZONE ${sql.lit(TZ)})`;

  const rows = await db
    .selectFrom('activities as a')
    .leftJoin('attendance as att', (j) =>
      j.onRef('att.activity_id', '=', 'a.id').onRef('att.organization_id', '=', 'a.organization_id'),
    )
    .where('a.organization_id', '=', orgId)
    .where('a.is_permanent', '=', false)
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
    throw new ReportError(400, `El mes tiene ${rows.length} actividades (máx ${MAX_REPORT_ROWS}).`);
  }

  const mapped: MonthlyRegisterRow[] = rows.map((r, i) => {
    const parts = String(r.localDate).split('-');
    const Y = Number(parts[0]); const M = Number(parts[1]); const D = Number(parts[2]);
    return {
      no: i + 1,
      // Mediodía UTC del día local: al escribir la celda Date, ningún corrimiento
      // de TZ del proceso/Excel la mueve de día.
      date: new Date(Date.UTC(Y, M - 1, D, 12, 0, 0)).toISOString(),
      semana: weekOfMonth(Y, M, D),
      tipo: tipoLabel(String(r.type)),
      programa: r.category ?? '',
      nombre: r.name,
      asistencia: Number(r.asistencia),
    };
  });

  // Resumen por tipo (las 5 etiquetas, en orden estable; sólo las con actividad).
  const tipoAgg = new Map<string, { actividades: number; asistencia: number }>();
  const progAgg = new Map<string, { actividades: number; asistencia: number }>();
  for (const r of mapped) {
    const t = tipoAgg.get(r.tipo) ?? { actividades: 0, asistencia: 0 };
    t.actividades += 1; t.asistencia += r.asistencia; tipoAgg.set(r.tipo, t);
    const pKey = r.programa || '(Sin programa)';
    const p = progAgg.get(pKey) ?? { actividades: 0, asistencia: 0 };
    p.actividades += 1; p.asistencia += r.asistencia; progAgg.set(pKey, p);
  }
  const porTipo: MonthlySummaryRow[] = TIPO_ORDER
    .filter((t) => tipoAgg.has(t))
    .map((t) => ({ label: t, ...tipoAgg.get(t)! }));
  const porPrograma: MonthlySummaryRow[] = [...progAgg.entries()]
    .sort((a, b) => b[1].asistencia - a[1].asistencia)
    .map(([label, v]) => ({ label, ...v }));

  return {
    year,
    month,
    monthName: monthNameEs(month),
    rows: mapped,
    totalActividades: mapped.length,
    totalAsistencia: mapped.reduce((a, r) => a + r.asistencia, 0),
    porTipo,
    porPrograma,
  };
}
