// packages/db/src/rls.ts · PLACEHOLDER · NO implementado en PR #2.
//
// Define el shape previsto para scopear queries por tenant cuando se
// habilite Row-Level Security. La implementación real llega en el PR de
// RLS, que también introduce los roles SQL app_v1 (BYPASSRLS) / app_v2
// (con policies) y las CREATE POLICY por tabla tenant-aware.
//
// Forma prevista (no funcional todavía):
//   await withTenant(db, organizationId, async (trx) => {
//     // dentro de la transacción se ejecuta:
//     //   SET LOCAL app.organization_id = '<organizationId>'
//     // y todas las queries de `trx` quedan scopeadas por la policy RLS.
//     return trx.selectFrom('staff_members').selectAll().execute();
//   });

import type { Kysely, Transaction } from 'kysely';
import type { Database } from './schema.js';

export async function withTenant<T>(
  _db: Kysely<Database>,
  _organizationId: string,
  _fn: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  throw new Error(
    'withTenant() no implementado todavía — llega en el PR de RLS ' +
      '(roles SQL app_v1/app_v2 + SET LOCAL app.organization_id). ' +
      'Ver docs/migration-v2/01-target-architecture.md',
  );
}
