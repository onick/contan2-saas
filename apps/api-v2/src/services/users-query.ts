// apps/api-v2/src/services/users-query.ts · condiciones SQL compartidas del
// padrón de visitantes. UNA fuente de verdad para qué significa cada cohorte y
// cada estado de archivado — la consume el listado (routes/users.ts) y el
// export (services/users-export.ts), para que nunca diverjan.

import { sql } from '@contan2/db';
import type { DbClient, RawBuilder } from '@contan2/db';
import type { UserCohort } from '@contan2/contracts';
import type { UserStatusFilter } from '../query.js';

// Predicado compartido "tiene email y nunca se le envió credencial".
// Lo reutilizan: cohortCondition('noCredential'), cohortCondition('active'/'dormant'),
// countAudienceByStatus, y routes/credentials-bulk (que lo importa en vez de repetirlo).
export const pendingPredicate = sql<boolean>`users.email is not null and users.credential_sent_at is null`;

// Subquery de última actividad para LEFT JOIN. Produce el alias `lv` con
// columnas (user_id, last_activity_at = max(coalesce(checked_in_at, registered_at))).
// Incluye registrations (registered_at) como fallback para usuarios que no
// hicieron check-in. Se usa en routes/users.ts y services/users-export.ts.
export function lastActivityJoin(db: DbClient, orgId: string) {
  return db.selectFrom('attendance')
    .select(['attendance.user_id'])
    .select(sql<Date | null>`max(coalesce(attendance.checked_in_at, attendance.registered_at))`.as('last_activity_at'))
    .where('attendance.organization_id', '=', orgId)
    .groupBy('attendance.user_id')
    .as('lv');
}

// CASE SQL con precedencia fija para el estado de audiencia de un usuario
// (sobre usuarios con deleted_at IS NULL). Usa el alias `lv.last_activity_at`
// del join lastActivityJoin que el caller debe haber añadido.
//   pendiente = tiene email y nunca se le envió credencial
//   activo    = no pendiente y actividad o created_at en los últimos 90 días
//   inactivo  = resto
// coalesce(lv.last_activity_at, '-infinity') evita NULL para usuarios sin asistencias:
// sin coalesce, NOT(NULL) = NULL y quedarían fuera de todos los estados.
export function audienceStatusCase() {
  return sql<string>`case
    when ${pendingPredicate} then 'pendiente'
    when coalesce(lv.last_activity_at, '-infinity'::timestamptz) >= now() - interval '90 days'
      or users.created_at >= now() - interval '90 days' then 'activo'
    else 'inactivo'
  end`;
}

// Partición completa del padrón en una sola query (count(*) filter).
// Acepta el executor del llamador (ya dentro de withTenant) sin envolver otro.
// total = count(*) filter (deleted_at IS NULL) en SQL, no suma JS.
export async function countAudienceByStatus(
  db: DbClient,
  orgId: string,
): Promise<{ total: number; activo: number; pendiente: number; inactivo: number; archivado: number }> {
  const row = await db
    .selectFrom('users')
    .leftJoin(lastActivityJoin(db, orgId), (join) => join.onRef('lv.user_id', '=', 'users.id'))
    .where('users.organization_id', '=', orgId)
    .select([
      sql<string>`count(*) filter (where users.deleted_at is null)`.as('total'),
      sql<string>`count(*) filter (where users.deleted_at is null and ${audienceStatusCase()} = 'pendiente')`.as('pendiente'),
      sql<string>`count(*) filter (where users.deleted_at is null and ${audienceStatusCase()} = 'activo')`.as('activo'),
      sql<string>`count(*) filter (where users.deleted_at is null and ${audienceStatusCase()} = 'inactivo')`.as('inactivo'),
      sql<string>`count(*) filter (where users.deleted_at is not null)`.as('archivado'),
    ])
    .executeTakeFirstOrThrow();
  return {
    total: Number(row.total),
    pendiente: Number(row.pendiente),
    activo: Number(row.activo),
    inactivo: Number(row.inactivo),
    archivado: Number(row.archivado),
  };
}

// Condición SQL de cohorte (null = 'all', sin filtro). Las cohortes de actividad
// (active/dormant) delegan en audienceStatusCase() para usar las mismas reglas
// que countAudienceByStatus; requieren el join lastActivityJoin en el caller.
//   frequent      visit_count >= 3
//   new7d         alta en los últimos 7 días
//   noEmail       sin correo
//   noCredential  con correo pero sin credencial enviada (= pendingPredicate)
//   active        audienceStatusCase() = 'activo'
//   dormant       audienceStatusCase() = 'inactivo'
export function cohortCondition(cohort: UserCohort) {
  switch (cohort) {
    case 'frequent': return sql<boolean>`users.visit_count >= 3`;
    case 'new7d': return sql<boolean>`users.created_at >= now() - interval '7 days'`;
    case 'noEmail': return sql<boolean>`users.email is null`;
    case 'noCredential': return pendingPredicate;
    case 'active': return sql<boolean>`${audienceStatusCase()} = 'activo'`;
    case 'dormant': return sql<boolean>`${audienceStatusCase()} = 'inactivo'`;
    default: return null;
  }
}

// Condición de archivado. 'active' = no archivados (deleted_at IS NULL, default
// del listado); 'archived' = sólo archivados; 'all' (null) = sin filtro.
export function statusCondition(status: UserStatusFilter) {
  if (status === 'active') return sql<boolean>`users.deleted_at is null`;
  if (status === 'archived') return sql<boolean>`users.deleted_at is not null`;
  return null;
}

// Subquery COUNT(*) de visitantes nuevos (users.created_at en [from, to)).
// Única fuente de verdad para "visitante nuevo": activo (deleted_at IS NULL)
// del org, registrado en el intervalo. Lo usan dashboard-overview (curr y prev)
// y cualquier otro cómputo que necesite el mismo criterio.
export function newVisitorCountQuery(
  db: DbClient,
  orgId: string,
  from: RawBuilder<Date>,
  to: RawBuilder<Date>,
) {
  return db.selectFrom('users')
    .select(db.fn.countAll<string>().as('n'))
    .where('organization_id', '=', orgId)
    .where('deleted_at', 'is', null)
    .where('created_at', '>=', from)
    .where('created_at', '<', to);
}
