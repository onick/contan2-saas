// packages/db/src/rls.ts · scoping de queries por tenant para Row-Level Security.
//
// Abre una transacción y fija el GUC `app.organization_id` con SET LOCAL, de
// modo que las RLS policies (USING organization_id = current_setting(...))
// filtren por la org del request. Todas las queries hechas con la `trx` que
// recibe el callback quedan scopeadas.
//
//   await withTenant(db, organizationId, async (trx) => {
//     return trx.selectFrom('users').selectAll().execute(); // solo filas de esa org
//   });
//
// Por qué SET LOCAL (vía set_config(..., true)) y NO un SET normal: el pool de
// pg reutiliza conexiones entre requests. Un SET de sesión filtraría el org de
// un request al siguiente sobre la misma conexión física. SET LOCAL vive solo
// lo que dura la transacción, así que la conexión vuelve "limpia" al pool.
//
// Modelo de roles (ver docs/migration-v2/11-rls-defense-in-depth-plan.md):
//   · v1 conecta como el rol DUEÑO de las tablas → ignora las policies (RLS
//     ENABLE sin FORCE). No requiere cambios en v1.
//   · v2 conecta como `app_v2` (no dueño) → sujeto a las policies.
// Mientras v2 siga conectando como dueño, withTenant() es correcto pero inerte
// (el dueño bypassa); el enforcement se activa al virar el rol de conexión.

import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Database } from './schema.js';

export async function withTenant<T>(
  db: Kysely<Database>,
  organizationId: string,
  fn: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  if (!organizationId) {
    // Defensa: nunca abrir una transacción tenant sin org. Sin GUC, las policies
    // hacen default-deny, pero fallar acá da un error claro en vez de "0 filas".
    throw new Error('withTenant() requiere un organizationId no vacío');
  }
  const run = async (trx: Transaction<Database>): Promise<T> => {
    // set_config(name, value, is_local=true) ≡ SET LOCAL, pero parametrizable
    // (evita interpolar el UUID en el texto del SET).
    await sql`select set_config('app.organization_id', ${organizationId}, true)`.execute(trx);
    return fn(trx);
  };

  // Nest-aware: Kysely 0.27 NO soporta transacciones anidadas (llamar
  // .transaction() sobre una Transaction lanza). Si `db` YA es una transacción
  // (un withTenant externo, o un db.transaction() convertido a withTenant),
  // reusamos esa transacción y solo re-fijamos el GUC — SET LOCAL es idempotente
  // y el orgId es el mismo. Solo abrimos una transacción nueva cuando `db` es el
  // pool. Esto permite componer withTenant sin romper por anidamiento.
  if (db.isTransaction) {
    return run(db as Transaction<Database>);
  }
  return db.transaction().execute(run);
}
