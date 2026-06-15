// apps/api-v2/src/services/users-query.ts · condiciones SQL compartidas del
// padrón de visitantes. UNA fuente de verdad para qué significa cada cohorte y
// cada estado de archivado — la consume el listado (routes/users.ts) y el
// export (services/users-export.ts), para que nunca diverjan.

import { sql } from '@contan2/db';
import type { UserCohort } from '@contan2/contracts';
import type { UserStatusFilter } from '../query.js';

// Condición SQL de cohorte (null = 'all', sin filtro). Las cohortes de actividad
// (active/dormant) referencian el alias `lv.last_visit_at` del join de última
// visita, que el caller debe haber añadido. Reglas congeladas (paridad v1):
//   frequent      visit_count >= 3
//   new7d         alta en los últimos 7 días
//   noEmail       sin correo
//   noCredential  con correo pero sin credencial enviada
//   active        última visita ≤ 30 días
//   dormant       nunca visitó, o última visita > 90 días
export function cohortCondition(cohort: UserCohort) {
  switch (cohort) {
    case 'frequent': return sql<boolean>`users.visit_count >= 3`;
    case 'new7d': return sql<boolean>`users.created_at >= now() - interval '7 days'`;
    case 'noEmail': return sql<boolean>`users.email is null`;
    case 'noCredential': return sql<boolean>`users.email is not null and users.credential_sent_at is null`;
    case 'active': return sql<boolean>`lv.last_visit_at >= now() - interval '30 days'`;
    case 'dormant': return sql<boolean>`lv.last_visit_at is null or lv.last_visit_at < now() - interval '90 days'`;
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
