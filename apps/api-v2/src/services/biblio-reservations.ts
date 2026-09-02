// apps/api-v2/src/services/biblio-reservations.ts · promoción PEREZOSA de la
// cola de reservas (F5, sin cron):
//   1) vence las 'lista' cuya ventana de retiro pasó (status → vencida)
//   2) mientras haya copia LIBRE del título y cola en 'espera', aparta la copia
//      para la reserva más antigua (status → lista, ready_item_id, expira +3 días)
// Copia LIBRE = ejemplar vivo, prestable, sin préstamo abierto y sin otra
// reserva 'lista' encima. Se invoca al crear/cancelar reservas, al devolver
// ejemplares (biblio-loans) y en las lecturas del módulo.

import { sql, type DbClient } from '@contan2/db';

export const PICKUP_DAYS = 3;
export const MAX_ACTIVE_RESERVATIONS = 3;

const TZ = 'America/Santo_Domingo';

// Fin del día (TZ del centro) a +N días — misma convención que los préstamos.
const expiresAtSql = (days: number) =>
  sql<string>`((date_trunc('day', now() at time zone ${TZ}) + ${`${days + 1} days`}::interval - interval '1 second') at time zone ${TZ})`;

// Vence las 'lista' expiradas de la org (devuelve cuántas venció).
export async function expireStaleReservations(db: DbClient, orgId: string): Promise<number> {
  const r = await db.updateTable('biblio_reservations')
    .set({ status: 'vencida', updated_at: sql`now()` })
    .where('organization_id', '=', orgId)
    .where('status', '=', 'lista')
    .where(sql<boolean>`expires_at < now()`)
    .executeTakeFirst();
  return Number(r?.numUpdatedRows ?? 0n);
}

// Promueve la cola de UN título: aparta copias libres para las esperas FIFO.
export async function promoteTitleQueue(db: DbClient, orgId: string, titleId: string): Promise<void> {
  // Bucle acotado: como mucho una promoción por copia libre.
  for (let i = 0; i < 20; i += 1) {
    const nextRes = await db.selectFrom('biblio_reservations')
      .select(['id'])
      .where('organization_id', '=', orgId).where('title_id', '=', titleId)
      .where('status', '=', 'espera')
      .orderBy('created_at', 'asc').orderBy('seq', 'asc')
      .limit(1).executeTakeFirst();
    if (!nextRes) return;

    const freeItem = await db.selectFrom('biblio_items as i')
      .select(['i.id'])
      .where('i.organization_id', '=', orgId).where('i.title_id', '=', titleId)
      .where('i.retired_at', 'is', null)
      .where('i.loanable', '=', true)
      .where('i.physical_status', 'in', ['bueno', 'deteriorado'])
      .where(sql<boolean>`not exists (select 1 from biblio_loans l where l.item_id = i.id and l.returned_at is null)`)
      .where(sql<boolean>`not exists (select 1 from biblio_reservations r where r.ready_item_id = i.id and r.status = 'lista')`)
      .orderBy('i.inventory_code', 'asc')
      .limit(1).executeTakeFirst();
    if (!freeItem) return;

    await db.updateTable('biblio_reservations')
      .set({
        status: 'lista', ready_item_id: freeItem.id,
        ready_at: sql`now()`, expires_at: expiresAtSql(PICKUP_DAYS),
        updated_at: sql`now()`,
      })
      .where('organization_id', '=', orgId).where('id', '=', nextRes.id)
      .where('status', '=', 'espera')
      .execute();
  }
}

// Mantenimiento de la org: vencer expiradas + re-promover los títulos tocados
// (los vencidos liberan copia) y los que tienen cola con copias libres.
export async function maintainReservations(db: DbClient, orgId: string): Promise<void> {
  await expireStaleReservations(db, orgId);
  const titles = await db.selectFrom('biblio_reservations')
    .select(['title_id'])
    .where('organization_id', '=', orgId)
    .where('status', '=', 'espera')
    .groupBy('title_id')
    .limit(50)
    .execute();
  for (const t of titles) await promoteTitleQueue(db, orgId, t.title_id);
}
