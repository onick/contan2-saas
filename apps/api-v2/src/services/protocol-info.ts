// apps/api-v2/src/services/protocol-info.ts · Protocolo PR-5: datos para el
// BANNER de puerta. Cuando el staff escanea o registra a un visitante que es
// invitado de protocolo, la respuesta lleva su categoría/tratamiento y los
// acompañantes autorizados de SU invitación a esa actividad (para recibirlo
// como corresponde). Lookups chicos e indexados; best-effort en los callers.

import type { DbClient } from '@contan2/db';

export interface ProtocolBadge {
  category: string;
  honorific: string | null;
  plusOnes: number;
}

export async function protocolBadgeFor(
  db: DbClient,
  orgId: string,
  userId: string,
  activityId: string | null,
): Promise<ProtocolBadge | null> {
  const prof = await db.selectFrom('protocol_profiles')
    .select(['category', 'honorific'])
    .where('organization_id', '=', orgId)
    .where('user_id', '=', userId)
    .where('active', '=', true)
    .executeTakeFirst();
  if (!prof) return null;

  let plusOnes = 0;
  if (activityId) {
    const inv = await db.selectFrom('invitations')
      .select('plus_ones')
      .where('organization_id', '=', orgId)
      .where('activity_id', '=', activityId)
      .where('user_id', '=', userId)
      .where('status', '!=', 'canceled')
      .executeTakeFirst();
    plusOnes = inv?.plus_ones ?? 0;
  }
  return { category: prof.category, honorific: prof.honorific, plusOnes };
}

// Versión por lote para la búsqueda de visitantes de la consola (un query).
export async function protocolMarksFor(
  db: DbClient,
  orgId: string,
  userIds: string[],
): Promise<Map<string, { category: string; honorific: string | null }>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.selectFrom('protocol_profiles')
    .select(['user_id', 'category', 'honorific'])
    .where('organization_id', '=', orgId)
    .where('active', '=', true)
    .where('user_id', 'in', userIds)
    .execute();
  return new Map(rows.map((r) => [r.user_id, { category: r.category, honorific: r.honorific }]));
}
