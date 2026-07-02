// apps/api-v2/src/services/protocol-holds.ts · Protocolo Modelo A (asiento
// garantizado). Una invitación de protocolo RETIENE el aforo desde que se
// envía: se materializa como la MISMA fila de reserva de asistencia
// (checked_in_at=null) que usa el RSVP, + el incremento atómico de
// enrolled_count. Así el VIP siempre tiene lugar y el RSVP "Sí voy" no
// re-reserva (encuentra la asistencia existente y corta). Al declinar/cancelar
// se libera. Guardar el party real como acompañantes hace que borrar la
// asistencia devuelva el cupo correcto (cierra la fuga del refund).

import type { DbClient } from '@contan2/db';
import { sql } from '@contan2/db';
import { randomUUID } from 'node:crypto';

// El +N se guarda como acompañantes según el público de la actividad (niños vs
// adultos), coherente con kiosko/puerta. Así party = 1 + children + adults.
export function companionsFor(audience: string, plusOnes: number): { companions_children: number; companions_adults: number } {
  return audience === 'infantil'
    ? { companions_children: plusOnes, companions_adults: 0 }
    : { companions_children: 0, companions_adults: plusOnes };
}

export type HoldResult = 'held' | 'adjusted' | 'exists' | 'no_capacity' | 'seated';

export interface HoldActivity {
  id: string;
  name: string;
  audience: string;
}

// Asegura la reserva del asiento garantizado (1+plusOnes) para un VIP en una
// actividad, dentro de una transacción. Idempotente: si ya hay reserva, ajusta
// el party; si el usuario ya asistió (checked_in_at≠null), no toca nada.
export async function ensureHold(
  tx: DbClient,
  orgId: string,
  act: HoldActivity,
  userId: string,
  userCode: string,
  plusOnes: number,
): Promise<HoldResult> {
  const party = 1 + plusOnes;
  const existing = await tx.selectFrom('attendance')
    .select(['id', 'checked_in_at', 'companions_children', 'companions_adults'])
    .where('organization_id', '=', orgId)
    .where('activity_id', '=', act.id)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (existing) {
    if (existing.checked_in_at != null) return 'seated'; // ya registrado/asistió: no es un hold
    const curParty = 1 + Number(existing.companions_children) + Number(existing.companions_adults);
    const delta = party - curParty;
    if (delta === 0) return 'exists';
    let upd = tx.updateTable('activities')
      .set(() => ({ enrolled_count: sql<number>`greatest(0, enrolled_count + ${delta})` }))
      .where('organization_id', '=', orgId).where('id', '=', act.id);
    if (delta > 0) upd = upd.where(sql<boolean>`enrolled_count + ${delta} <= capacity`);
    const res = await upd.executeTakeFirst();
    if (delta > 0 && Number(res.numUpdatedRows ?? 0) === 0) return 'no_capacity';
    await tx.updateTable('attendance').set(companionsFor(act.audience, plusOnes))
      .where('id', '=', existing.id).execute();
    return 'adjusted';
  }

  // Reserva nueva, atómica: solo si entra en el aforo.
  const reserved = await tx.updateTable('activities')
    .set((eb) => ({ enrolled_count: eb('enrolled_count', '+', party) }))
    .where('organization_id', '=', orgId).where('id', '=', act.id)
    .where(sql<boolean>`enrolled_count + ${party} <= capacity`)
    .executeTakeFirst();
  if (Number(reserved.numUpdatedRows ?? 0) === 0) return 'no_capacity';

  await tx.insertInto('attendance').values({
    id: randomUUID(),
    organization_id: orgId,
    user_id: userId,
    user_code: userCode,
    activity_id: act.id,
    activity_name: act.name,
    anonymous: false,
    ...companionsFor(act.audience, plusOnes),
    checked_in_at: null, // reserva (hold), no check-in
  } as never).execute();
  return 'held';
}

// Libera un hold NO confirmado (checked_in_at=null): devuelve el aforo y borra
// la reserva. No toca asistencias reales (checked_in_at≠null). Devuelve true si
// liberó algo.
export async function releaseHold(
  tx: DbClient,
  orgId: string,
  activityId: string,
  userId: string,
): Promise<boolean> {
  const row = await tx.selectFrom('attendance')
    .select(['id', 'checked_in_at', 'companions_children', 'companions_adults'])
    .where('organization_id', '=', orgId)
    .where('activity_id', '=', activityId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!row || row.checked_in_at != null) return false;
  const party = 1 + Number(row.companions_children) + Number(row.companions_adults);
  await tx.updateTable('activities')
    .set(() => ({ enrolled_count: sql<number>`greatest(0, enrolled_count - ${party})` }))
    .where('organization_id', '=', orgId).where('id', '=', activityId).execute();
  await tx.deleteFrom('attendance').where('id', '=', row.id).execute();
  return true;
}
