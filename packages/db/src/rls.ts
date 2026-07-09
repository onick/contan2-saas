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
    // (evita interpolar el UUID en el texto del SET). En el MISMO round-trip leemos
    // el valor previo: si la transacción YA estaba scopeada a OTRA org (withTenant
    // anidado con org distinta — footgun), fallamos en vez de pisar el scope del
    // caller. Cero costo extra (una sola query en vez de un SET + un SELECT aparte).
    const res = await sql<{ prev: string | null }>`
      select current_setting('app.organization_id', true) as prev,
             set_config('app.organization_id', ${organizationId}, true) as cur
    `.execute(trx);
    const prev = res.rows[0]?.prev;
    if (prev && prev !== organizationId) {
      throw new Error(
        `withTenant: la transacción ya está scopeada a la organización ${prev}; ` +
          `no se puede re-scopear a ${organizationId} (anidamiento con org distinta).`,
      );
    }
    return fn(trx);
  };

  // Nest-aware: Kysely 0.27 NO soporta transacciones anidadas (llamar
  // .transaction() sobre una Transaction lanza). Si `db` YA es una transacción
  // (un withTenant externo, o un db.transaction() convertido a withTenant),
  // la reusamos — pero envolviendo `fn` en un SAVEPOINT para PRESERVAR la
  // semántica de sub-transacción del código original: si `fn` lanza (incluido un
  // error de aplicación como CheckinError, con la tx NO abortada, o un error SQL
  // que sí la aborta), se hace ROLLBACK TO SAVEPOINT y se re-lanza, dejando la tx
  // externa intacta y utilizable. Sin esto, un throw atrapado por el caller haría
  // que la tx externa COMMITEE escrituras parciales (oversell de cupo, pérdida de
  // aislamiento por-fila en imports). Solo abrimos una transacción nueva cuando
  // `db` es el pool.
  if (db.isTransaction) {
    const trx = db as Transaction<Database>;
    const sp = `wt_sp_${(_savepointSeq = (_savepointSeq + 1) & 0x7fffffff)}`;
    await sql`savepoint ${sql.raw(sp)}`.execute(trx);
    try {
      const result = await run(trx);
      await sql`release savepoint ${sql.raw(sp)}`.execute(trx);
      return result;
    } catch (err) {
      // ROLLBACK TO recupera la tx incluso si un error SQL la dejó abortada;
      // luego RELEASE limpia el savepoint (evita acumularlos en loops de N filas).
      await sql`rollback to savepoint ${sql.raw(sp)}`.execute(trx);
      await sql`release savepoint ${sql.raw(sp)}`.execute(trx);
      throw err;
    }
  }
  return db.transaction().execute(run);
}

// Contador de savepoints para nombres únicos por nivel de anidamiento (no puede
// usar Math.random en este entorno; un secuencial acotado alcanza y es estable).
let _savepointSeq = 0;
