// apps/api-v2/src/services/puerta-kpis.ts · consultas de Puerta (salas
// permanentes) compartidas por /puerta/stats y el Asistente de Reportes.
// Todo en PERSONAS (1 + acompañantes/alumnos) con registros aparte. La ventana
// [from, to] es inclusiva, en días locales de la puerta.
//
// OJO (mismo fix que puerta-stats): el cast ::timestamp ANTES del AT TIME ZONE es
// obligatorio; con un operando date Postgres corre la ventana ±8 h.

import { sql, type DbClient } from '@contan2/db';

import { REPORT_TZ as TZ } from './timezone.js';

export const PEOPLE = sql<string>`coalesce(sum(1 + a.companions_children + a.companions_adults), 0)`;

export interface PuertaSala { id: string; name: string; capacity: number }

/** Salas permanentes del tenant (incluye desactivadas: su histórico cuenta). */
export async function listPuertaSalas(db: DbClient, orgId: string): Promise<PuertaSala[]> {
  return db.selectFrom('activities')
    .select(['id', 'name', 'capacity'])
    .where('organization_id', '=', orgId).where('is_permanent', '=', true)
    .orderBy('name', 'asc').execute();
}

/** Base de consulta: asistencias a salas permanentes dentro de la ventana. */
export function puertaBase(db: DbClient, orgId: string, ids: string[], from: string, to: string) {
  return db.selectFrom('attendance as a')
    .where('a.organization_id', '=', orgId)
    .where('a.is_permanent', '=', true)
    .where('a.activity_id', 'in', ids)
    .where(sql<boolean>`a.registered_at >= (${from}::timestamp AT TIME ZONE ${sql.lit(TZ)})`)
    .where(sql<boolean>`a.registered_at < ((${to}::date + 1)::timestamp AT TIME ZONE ${sql.lit(TZ)})`);
}

/** KPIs de una ventana: personas, registros, identificados y gente en grupos. */
export async function puertaKpis(db: DbClient, orgId: string, ids: string[], from: string, to: string) {
  if (ids.length === 0) return { people: 0, entries: 0, identified: 0, groupPeople: 0 };
  const r = await puertaBase(db, orgId, ids, from, to)
    .select([
      sql<string>`count(*)`.as('entries'),
      PEOPLE.as('people'),
      sql<string>`count(distinct a.user_id)`.as('identified'),
      sql<string>`coalesce(sum(case when a.group_label is not null then 1 + a.companions_children + a.companions_adults end), 0)`.as('groupPeople'),
    ])
    .executeTakeFirst();
  return {
    people: Number(r?.people ?? 0), entries: Number(r?.entries ?? 0),
    identified: Number(r?.identified ?? 0), groupPeople: Number(r?.groupPeople ?? 0),
  };
}

/** Registros y personas por sala en la ventana (solo salas con movimiento). */
export async function puertaBySala(db: DbClient, orgId: string, ids: string[], from: string, to: string) {
  if (ids.length === 0) return new Map<string, { entries: number; people: number }>();
  const rows = await puertaBase(db, orgId, ids, from, to)
    .select(['a.activity_id', sql<string>`count(*)`.as('entries'), PEOPLE.as('people')])
    .groupBy('a.activity_id').execute();
  return new Map(rows.map((r) => [r.activity_id, { entries: Number(r.entries), people: Number(r.people) }]));
}
