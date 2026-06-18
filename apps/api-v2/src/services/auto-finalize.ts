// apps/api-v2/src/services/auto-finalize.ts · finaliza automáticamente las
// actividades cuya HORA DE CIERRE configurada (end_date; si no hay, la de inicio
// date) ya pasó. Espejo del job de v1 pero con el criterio CORRECTO: v1 usaba
// `date` y cerraba la actividad apenas EMPEZABA. Multi-tenant (barre todas las
// orgs), idempotente (solo status='activa'). Se arranca en el bootstrap del
// server (no en buildApp → los tests no lo disparan).

import { sql, type DbClient } from '@contan2/db';

const HOUR_MS = 60 * 60 * 1000;

// Marca 'finalizada' toda actividad activa cuya hora de cierre ya pasó.
// Devuelve cuántas se finalizaron.
export async function finalizePastActivities(db: DbClient): Promise<number> {
  const r = await db
    .updateTable('activities')
    .set({ status: 'finalizada', updated_at: new Date().toISOString() })
    .where('status', '=', 'activa')
    .where(sql<boolean>`coalesce(end_date, date) < now()`)
    .executeTakeFirst();
  return Number(r.numUpdatedRows ?? 0);
}

// Corre una pasada inicial + cada `intervalMs` (default 1 h). unref() para no
// bloquear el cierre del proceso. Devuelve el handle (para tests/cleanup).
export function startAutoFinalize(db: DbClient, intervalMs = HOUR_MS): NodeJS.Timeout {
  const tick = async () => {
    try {
      const n = await finalizePastActivities(db);
      if (n > 0) console.log(`[auto-finalize] ${n} actividad(es) finalizadas por hora de cierre`);
    } catch (e) {
      console.error('[auto-finalize] error:', (e as Error).message);
    }
  };
  void tick(); // pasada inicial al arrancar
  const h = setInterval(() => void tick(), intervalMs);
  h.unref();
  return h;
}
