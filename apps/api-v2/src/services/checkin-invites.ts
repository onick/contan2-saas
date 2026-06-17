// apps/api-v2/src/services/checkin-invites.ts · "¿está en la lista de invitados?"
// para la búsqueda de visitantes de la consola de check-in. Por LOTE (un query,
// sin N+1), best-effort en el caller. Solo actividades ACTIVAS e invitaciones no
// canceladas. Informativo en la puerta — NO bloquea el registro.

import type { DbClient } from '@contan2/db';

export interface InvitedActivityMark {
  activityId: string;
  activityName: string;
}

// Map<userId, InvitedActivityMark[]>: a qué actividades activas está invitado
// cada usuario del lote. Orden por fecha de actividad (la más próxima primero).
export async function invitedActivitiesFor(
  db: DbClient,
  orgId: string,
  userIds: string[],
): Promise<Map<string, InvitedActivityMark[]>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.selectFrom('invitations as i')
    .innerJoin('activities as a', 'a.id', 'i.activity_id')
    .select(['i.user_id', 'a.id as activity_id', 'a.name as activity_name', 'a.date as activity_date'])
    .where('i.organization_id', '=', orgId)
    .where('i.user_id', 'in', userIds)
    .where('i.status', '!=', 'canceled')
    .where('a.status', '=', 'activa')
    .orderBy('a.date', 'asc')
    .execute();

  const map = new Map<string, InvitedActivityMark[]>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const list = map.get(r.user_id) ?? [];
    list.push({ activityId: r.activity_id, activityName: r.activity_name });
    map.set(r.user_id, list);
  }
  return map;
}

export interface GuestListStats {
  total: number;   // invitaciones no canceladas
  arrived: number; // de esas, cuántas hicieron check-in REAL (checked_in_at)
}

// Por lote para la lista de actividades del check-in: cuántos invitados tiene
// cada actividad y cuántos ya llegaron. Solo invitaciones no canceladas; el
// "llegó" exige check-in real (checked_in_at), igual que el badge "Asistió".
export async function guestListStatsFor(
  db: DbClient,
  orgId: string,
  activityIds: string[],
): Promise<Map<string, GuestListStats>> {
  if (activityIds.length === 0) return new Map();
  const rows = await db.selectFrom('invitations as i')
    // Excluir invitados ARCHIVADOS (users.deleted_at) para que el conteo del card
    // coincida con la lista del modal (no contar gente oculta del padrón).
    .innerJoin('users as iu', 'iu.id', 'i.user_id')
    .leftJoin('attendance as a', (join) => join
      .onRef('a.user_id', '=', 'i.user_id')
      .onRef('a.activity_id', '=', 'i.activity_id')
      .on('a.organization_id', '=', orgId)
      .on('a.checked_in_at', 'is not', null))
    .select((eb) => [
      'i.activity_id as activity_id',
      eb.fn.count<number>('i.id').distinct().as('total'),
      eb.fn.count<number>('a.id').distinct().as('arrived'),
    ])
    .where('iu.deleted_at', 'is', null)
    .where('i.organization_id', '=', orgId)
    .where('i.activity_id', 'in', activityIds)
    .where('i.status', '!=', 'canceled')
    .groupBy('i.activity_id')
    .execute();

  return new Map(rows.map((r) => [r.activity_id, { total: Number(r.total), arrived: Number(r.arrived) }]));
}
