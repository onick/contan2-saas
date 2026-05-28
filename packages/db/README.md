# @contan2/db

Capa de acceso a datos del stack v2: tipos Kysely + pool Postgres.

## Alcance (PR #2)

- Tipos manuales de las **6 tablas core** de auth/platform/audit:
  `organizations`, `staff_members`, `staff_auth_sessions`, `platform_admins`,
  `platform_sessions`, `tenant_audit_log`.
- `createDb()` / `getDb()` / `closeDb()` · instancia Kysely sobre `pg.Pool`.
- `pingDb()` · SELECT 1 para health-check interno.
- `withTenant()` · **placeholder** del shape RLS (lanza error; llega en el PR de RLS).

## Estrategia de tipos: manual + drift-test (híbrido)

Los tipos en `src/schema.ts` se transcriben **a mano** desde las migraciones
v1 (`backend/src/db/postgres/migrations/`). v1 sigue siendo dueño del schema
durante la coexistencia; `packages/db` solo declara lo que v2 va a tocar
(omite tablas legacy como `org_members`, `sessions`, `users`, etc.).

El drift se controla con `test/schema-parity.test.ts`: introspecciona
`information_schema` del Postgres efímero y verifica que cada columna
declarada existe en la DB real. Si una migración v1 cambia una columna que
declaramos, el test falla y avisamos.

`kysely-codegen` **no** se usa todavía — se evalúa cuando el número de
tablas crezca y el mantenimiento manual sea pesado.

## Convenciones de tipos

| SQL | Kysely |
|---|---|
| `UUID DEFAULT gen_random_uuid()` | `Generated<string>` |
| `BIGSERIAL` | `Generated<string>` (bigint llega como string desde pg) |
| `TIMESTAMPTZ DEFAULT NOW()` (created) | `ColumnType<Date, string\|undefined, never>` |
| `TIMESTAMPTZ DEFAULT NOW()` (updated) | `ColumnType<Date, string\|undefined, string\|undefined>` |
| `TIMESTAMPTZ NOT NULL` (expires) | `ColumnType<Date, string, string>` |
| `TIMESTAMPTZ NULL` | `ColumnType<Date\|null, string\|null\|undefined, string\|null>` |
| `JSONB` | `JSONColumnType<Record<string, unknown>>` |
| `CITEXT` | `string` |
| `TEXT CHECK (...)` | unión de literales (ver `src/enums.ts`) |

## Uso

```ts
import { createDb } from '@contan2/db';

const db = createDb(); // lee process.env.DATABASE_URL
const orgs = await db
  .selectFrom('organizations')
  .select(['id', 'slug', 'status'])
  .where('deleted_at', 'is', null)
  .execute();
await db.destroy();
```

`DATABASE_URL` se lee de `process.env` directamente (no de `@contan2/config`,
que aún no expone esa var — se centraliza en un PR posterior).

## Test local

```bash
# 1. Postgres efímero
docker compose -f docker-compose.test.yml up -d postgres-test

# 2. Migraciones v1 (v1 es dueño del schema)
cd backend && DB_DRIVER=postgres \
  DATABASE_URL=postgres://test:test@localhost:5433/contan2_test \
  SECRET_BASE=test-secret-base-32-bytes-min-aaaaaaaaaaaaaaaa \
  ROOT_DOMAIN=localhost PUBLIC_URL=http://localhost:3457 \
  node scripts/seed-test-fixtures.mjs

# 3. Parity test
DATABASE_URL=postgres://test:test@localhost:5433/contan2_test \
  pnpm --filter @contan2/db test

# 4. Cleanup
docker compose -f docker-compose.test.yml down
```

Sin `DATABASE_URL`, el parity test se skipea (no falla).

## NO incluido en este package (todavía)

- Migraciones (las owns v1)
- RLS real / roles SQL
- Tablas de negocio (`users`, `activities`, `attendance`)
- Repos/queries de dominio (llegan con cada módulo migrado)
