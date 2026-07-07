// apps/api-v2/src/services/reports/monthly-register.ts · arma el "registro
// mensual" en el formato del departamento (Cine/Teatro): una fila por actividad
// con fecha del mes, ordenada por fecha, con la asistencia = check-ins reales
// (headcount, incluye acompañantes). Read-only, tenant-scoped (organization_id
// es la frontera pre-RLS). Excluye salas permanentes (no son eventos con fecha).

import { sql, type DbClient } from '@contan2/db';
import { ReportError, MAX_REPORT_ROWS } from '../report-data.js';

// Mapa de los 7 `type` de v2 al vocabulario de 5 del departamento.
const TIPO_LABEL: Record<string, string> = {
  cine: 'Cine',
  teatro: 'Teatro',
  taller: 'Talleres',
  conferencia: 'Charlas',
  concierto: 'Otras Actividades',
  exposicion: 'Otras Actividades',
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

// Semana-del-mes determinista (lunes como inicio): la semana 1 contiene el día 1;
// avanza en cada lunes. Reemplaza la numeración manual e irregular del Excel.
function weekOfMonth(d: Date): number {
  const day = d.getUTCDate();
  const firstDow = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).getUTCDay(); // 0=Dom..6=Sáb
  const offsetMon = (firstDow + 6) % 7; // 0=Lun..6=Dom
  return Math.ceil((day + offsetMon) / 7);
}

export interface MonthlyRegisterRow {
  no: number;
  date: string; // ISO (celda Date en el Excel)
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
  const fromDate = new Date(Date.UTC(year, month - 1, 1));
  const toExclusive = new Date(Date.UTC(year, month, 1));

  const rows = await db
    .selectFrom('activities as a')
    .leftJoin('attendance as att', (j) =>
      j.onRef('att.activity_id', '=', 'a.id').onRef('att.organization_id', '=', 'a.organization_id'),
    )
    .where('a.organization_id', '=', orgId)
    .where('a.is_permanent', '=', false)
    .where('a.date', '>=', fromDate)
    .where('a.date', '<', toExclusive)
    .groupBy(['a.id', 'a.name', 'a.date', 'a.type', 'a.category'])
    .select(['a.id as id', 'a.name as name', 'a.date as date', 'a.type as type', 'a.category as category'])
    .select(sql<string>`coalesce(sum(1 + att.companions_children + att.companions_adults), 0)`.as('asistencia'))
    .orderBy('a.date', 'asc')
    .orderBy('a.name', 'asc')
    .execute();

  if (rows.length > MAX_REPORT_ROWS) {
    throw new ReportError(400, `El mes tiene ${rows.length} actividades (máx ${MAX_REPORT_ROWS}).`);
  }

  const mapped: MonthlyRegisterRow[] = rows.map((r, i) => {
    const d = r.date instanceof Date ? r.date : new Date(r.date as unknown as string);
    return {
      no: i + 1,
      date: d.toISOString(),
      semana: weekOfMonth(d),
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
