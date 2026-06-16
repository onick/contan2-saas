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
