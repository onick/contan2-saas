// apps/api-v2/src/services/reports/scope.ts · UNA sola definición de qué
// actividades cuentan como "realizadas" en los reportes de período.
//
// Decisiones (auditoría 2026-10-19, REP-A01/A02 + decisión del dueño P1):
//  · Las salas permanentes (is_permanent) quedan FUERA del motor de período:
//    sus visitas viven en Puerta (registered_at), no en activities.date, y su
//    aforo (p. ej. 100000) hundiría la ocupación.
//  · Las actividades canceladas no se realizaron: no cuentan como actividad,
//    ni aforo, ni asistencia del período, aunque tengan check-ins previos a la
//    cancelación. Esas asistencias siguen visibles en el informe POR actividad
//    (loadActivityReportData), que no pasa por este filtro.
// Todos los motores (period-summary, report-data, attendance-by-activity,
// registro mensual) deben usar `reportableActivity` para no volver a divergir.

import { sql } from '@contan2/db';

/** Predicado WHERE para la tabla `activities` con el alias dado (por defecto `a`). */
export function reportableActivity(alias = 'a') {
  return sql<boolean>`(${sql.ref(`${alias}.is_permanent`)} = false and ${sql.ref(`${alias}.status`)} <> 'cancelada')`;
}

/** Fragmento SQL crudo equivalente para consultas escritas a mano (alias `a`). */
export const REPORTABLE_ACTIVITY_RAW = sql`(a.is_permanent = false and a.status <> 'cancelada')`;
