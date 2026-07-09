// packages/db/test/rls.test.ts
//
// Tests de RLS para multitenant v2. Los casos que necesitan Postgres se gatean
// con DATABASE_URL, igual que schema-parity.test.ts.
//
// Importante: el enforcement real requiere que la migración
// backend/src/db/postgres/migrations/047_rls_tenant_isolation.sql ya esté
// aplicada en la DB de test. Si pg_policies no contiene las policies esperadas,
// el test de aislamiento se skipea explícitamente; no intenta validar RLS como
// owner porque el owner bypassea ENABLE RLS sin FORCE.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type Kysely } from 'kysely';
import { createDb, type Database } from '../src/index.js';
import { withTenant } from '../src/rls.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

const RLS_TABLES = [
  'users',
  'activities',
  'attendance',
  'invitations',
  'tenant_audit_log',
  'protocol_profiles',
] as const;

type CountRow = { count: string };
type CurrentSettingRow = { v: string | null };
type UserRow = { id: string; organization_id: string; code: string };
type SetRoleProbe = {
  current_user: string;
  app_v2_exists: boolean;
  is_superuser: boolean;
  is_member: boolean;
};

describe('withTenant · validación local', () => {
  it('rechaza organizationId vacío antes de abrir una transacción', async () => {
    let openedTransaction = false;
    const db = {
      transaction() {
        openedTransaction = true;
        return {
          execute: async () => undefined,
        };
      },
    } as unknown as Kysely<Database>;

    await expect(withTenant(db, '', async () => undefined)).rejects.toThrow(/organizationId/);
    expect(openedTransaction).toBe(false);
  });
});

run('RLS tenant isolation · Postgres', () => {
  let db: Kysely<Database>;

  beforeAll(() => {
    db = createDb(DATABASE_URL);
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it('withTenant setea app.organization_id como GUC local', async () => {
    const orgId = randomUUID();
    const row = await withTenant(db, orgId, async (trx) => {
      const result = await sql<CurrentSettingRow>`
        select current_setting('app.organization_id', true) as v
      `.execute(trx);
      return result.rows[0];
    });

    expect(row?.v).toBe(orgId);
  });

  it('enforcea aislamiento cross-tenant con SET LOCAL ROLE app_v2', async (ctx) => {
    const missingPolicies = await policiesMissingForScope();
    if (missingPolicies.length > 0) {
      ctx.skip(`migración 047 no aplicada; faltan policies tenant_isolation en: ${missingPolicies.join(', ')}`);
    }

    const roleProbe = await getSetRoleProbe();
    expect(roleProbe.app_v2_exists, 'la migración 047 debe crear el rol app_v2').toBe(true);
    expect(
      roleProbe.is_superuser || roleProbe.is_member,
      `el rol conector ${roleProbe.current_user} debe ser superuser o miembro de app_v2 para SET LOCAL ROLE app_v2`,
    ).toBe(true);

    const stamp = randomUUID().replace(/-/g, '').slice(0, 12);
    const orgA = await insertOrg(`rls-a-${stamp}`, `RLS A ${stamp}`);
    const orgB = await insertOrg(`rls-b-${stamp}`, `RLS B ${stamp}`);
    const userA = await insertUser(orgA, `RLSA-${stamp.slice(0, 8)}`, 'Ada');
    const userB = await insertUser(orgB, `RLSB-${stamp.slice(0, 8)}`, 'Beto');

    await db.transaction().execute(async (trx) => {
      try {
        await sql`set local role app_v2`.execute(trx);
      } catch (error) {
        throw new Error(
          `No se pudo ejecutar SET LOCAL ROLE app_v2 como ${roleProbe.current_user}; ` +
            'este test no puede validar RLS real como owner. Hacé al rol conector miembro de app_v2 o corré con superuser.',
          { cause: error },
        );
      }

      await sql`select set_config('app.organization_id', ${orgA}, true)`.execute(trx);

      const visible = await sql<UserRow>`
        select id, organization_id, code
          from users
         where id in (${userA}, ${userB})
         order by code
      `.execute(trx);

      expect(visible.rows).toEqual([{ id: userA, organization_id: orgA, code: `RLSA-${stamp.slice(0, 8)}` }]);

      await sql`savepoint rls_with_check`.execute(trx);
      await expect(sql`
        insert into users (id, organization_id, code, first_name, last_name, email, phone, visit_count)
        values (${randomUUID()}, ${orgB}::uuid, ${`RLSX-${stamp.slice(0, 8)}`}, 'Cross', 'Tenant', null, null, 1)
      `.execute(trx)).rejects.toThrow();
      await sql`rollback to savepoint rls_with_check`.execute(trx);
      await sql`release savepoint rls_with_check`.execute(trx);
    });

    await db.transaction().execute(async (trx) => {
      await sql`set local role app_v2`.execute(trx);
      const withoutGuc = await sql<CountRow>`
        select count(*)::text as count
          from users
         where id in (${userA}, ${userB})
      `.execute(trx);

      expect(withoutGuc.rows[0]?.count).toBe('0');

      await sql`select set_config('app.organization_id', ${orgB}, true)`.execute(trx);
      await sql`savepoint rls_wrong_guc`.execute(trx);
      await expect(sql`
        insert into users (id, organization_id, code, first_name, last_name, email, phone, visit_count)
        values (${randomUUID()}, ${orgA}::uuid, ${`RLSY-${stamp.slice(0, 8)}`}, 'Wrong', 'Guc', null, null, 1)
      `.execute(trx)).rejects.toThrow();
      await sql`rollback to savepoint rls_wrong_guc`.execute(trx);
      await sql`release savepoint rls_wrong_guc`.execute(trx);
    });
  });

  async function policiesMissingForScope(): Promise<string[]> {
    const result = await sql<{ tablename: string }>`
      select tablename
        from pg_policies
       where schemaname = 'public'
         and policyname = 'tenant_isolation'
         and tablename in (${sql.join(RLS_TABLES)})
    `.execute(db);
    const existing = new Set(result.rows.map((row) => row.tablename));
    return RLS_TABLES.filter((table) => !existing.has(table));
  }

  async function getSetRoleProbe(): Promise<SetRoleProbe> {
    const result = await sql<SetRoleProbe>`
      select
        current_user,
        exists(select 1 from pg_roles where rolname = 'app_v2') as app_v2_exists,
        coalesce((select rolsuper from pg_roles where rolname = current_user), false) as is_superuser,
        pg_has_role(current_user, 'app_v2', 'member') as is_member
    `.execute(db);
    return result.rows[0]!;
  }

  async function insertOrg(slug: string, name: string): Promise<string> {
    const row = await db
      .insertInto('organizations')
      .values({ slug, name, status: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function insertUser(organizationId: string, code: string, firstName: string): Promise<string> {
    const id = randomUUID();
    await db
      .insertInto('users')
      .values({
        id,
        organization_id: organizationId,
        code,
        first_name: firstName,
        last_name: 'Tenant',
        email: null,
        phone: null,
        visit_count: 1,
      })
      .execute();
    return id;
  }
});
