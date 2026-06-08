// apps/api-v2/src/services/checkin-idempotency.ts · RETENCIÓN de Idempotency-Keys
// del check-in anónimo. La tabla `checkin_idempotency` no debe crecer sin límite:
// cada key tiene `expires_at` (TTL 24h) y este cleanup borra las expiradas por
// LOTES. NO se ejecuta automáticamente (sin cron acá): se invoca desde un job/
// comando externo.
//
// FRECUENCIA RECOMENDADA: con TTL de 24h, un barrido cada 1–6 h mantiene la tabla
// chica; un barrido diario basta funcionalmente. Llamar en bucle hasta que
// devuelva 0 para vaciar backlogs grandes sin un DELETE masivo de un solo golpe.

import { sql, type DbClient } from '@contan2/db';

// Borra hasta `batchSize` keys expiradas (expires_at <= now()). Devuelve cuántas
// borró (0 = no quedan expiradas). Usa ctid para un DELETE acotado y barato.
export async function cleanupExpiredCheckinKeys(db: DbClient, batchSize = 1000): Promise<number> {
  const res = await sql<{ n: string }>`
    WITH del AS (
      DELETE FROM checkin_idempotency
      WHERE ctid IN (
        SELECT ctid FROM checkin_idempotency WHERE expires_at <= now() LIMIT ${batchSize}
      )
      RETURNING 1
    )
    SELECT count(*) AS n FROM del
  `.execute(db);
  return Number(res.rows[0]?.n ?? 0);
}
