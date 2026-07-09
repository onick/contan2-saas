# 11 · Row-Level Security como defensa en profundidad (PLAN — para revisión)

**Estado:** propuesta · NO ejecutado · 2026-06-26
**Autor:** auditoría cross-tenant v2 (sesión 2026-06-26)
**Depende de:** `packages/db/src/rls.ts` (placeholder ya existente), `apps/api-v2/src/guard.ts`

---

## 1. Problema

v2 es multi-tenant shared-DB. El aislamiento entre organizaciones depende **hoy
al 100% de que cada query lleve `WHERE organization_id = <org del guard>`**. La
auditoría del 2026-06-26 verificó que **todas** las rutas lo cumplen y que el
`org_id` siempre viene del guard (confiable), nunca del body. **No hay hueco
activo.**

Pero es una garantía *a nivel de aplicación*: un endpoint futuro, un refactor o
un `JOIN` mal escrito que olvide el filtro **no tiene red de seguridad**. RLS
mueve la garantía a Postgres: si la app olvida el `WHERE`, la base **igual**
rechaza las filas de otra org. Es defensa en profundidad, no un parche a un bug.

---

## 2. Decisión de diseño (afina el intent ya escrito en `rls.ts`)

### 2.1 Roles SQL y por qué v1 NO se toca

Las tablas hoy son propiedad del rol administrador con el que conecta el
`DATABASE_URL` actual (el "owner"). Aprovechamos una propiedad de Postgres:

> Con `ENABLE ROW LEVEL SECURITY` (sin `FORCE`), **el dueño de la tabla ignora
> las policies automáticamente**. Solo los roles no-dueños quedan sujetos.

Por lo tanto:

| Rol | Quién lo usa | Sujeto a RLS |
|-----|--------------|--------------|
| **owner** (rol actual) | **v1** (Express) — sin cambios | No (bypass automático por ser dueño) |
| **`app_v2`** (nuevo, least-privilege, NO dueño, NO `BYPASSRLS`) | **v2** (Fastify) | **Sí** |

Consecuencia: **v1 sigue funcionando sin tocar una línea ni un env** (cumple la
regla "NO tocar v1 sin OK textual"). No hace falta el rol `app_v1` que sugería
el placeholder — basta con dejar a v1 sobre el owner. El único cambio de
conexión es el `DATABASE_URL` de **v2**, que pasa a `app_v2`.

### 2.2 Mecanismo: GUC por transacción (`SET LOCAL`)

`withTenant(db, orgId, fn)` abre una **transacción** Kysely, ejecuta
`SET LOCAL app.organization_id = '<orgId>'` y corre `fn(trx)` dentro. La policy
lee ese GUC:

```sql
CREATE POLICY tenant_isolation ON users
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
```

- **`SET LOCAL`** (no `SET` a secas): el valor vive solo lo que dura la
  transacción. Con el pool reusando conexiones (max 10), un `SET` normal
  **filtraría el org de un request al siguiente** — bug crítico. `SET LOCAL` lo
  evita por construcción.
- **`nullif(current_setting(..., true), '')::uuid`**: el segundo argumento
  `true` evita el error "unrecognized configuration parameter". PERO cuidado: un
  GUC custom que ya se seteó con `SET LOCAL` en la sesión, al salir de la
  transacción **no vuelve a `NULL` sino a string vacío `''`** (Postgres reusa la
  conexión del pool). Sin el `nullif`, `''::uuid` **lanza** `invalid input
  syntax for type uuid` en vez de default-deny. Con `nullif('', '')` → `NULL` →
  ninguna fila matchea → **default-deny** limpio para `app_v2`. Para el owner
  (v1) la policy ni se evalúa. *(Verificado con el test gated real: sin el
  nullif el test de default-deny fallaba con ese error.)*
- `WITH CHECK` replica el `USING` para que un `INSERT`/`UPDATE` no pueda escribir
  filas con `organization_id` de otra org.

### 2.3 Tablas en alcance

Tenant-owned con `organization_id` (verificado contra las migraciones v1):

**Fase de datos (alto valor — entran primero):**
`users`, `activities`, `attendance`, `invitations`, `tenant_audit_log`,
`protocol_profiles`.

**Excluidas a propósito (documentado):**
- `staff_members`, `staff_auth_sessions`, `staff_invitations`, `staff_sessions`
  (legacy): el **guard las consulta ANTES de tener contexto de org** (resuelve la
  sesión por token y *después* compara la org). Ponerles RLS obligaría a
  reestructurar el guard. Su chequeo cross-org a nivel app ya es correcto
  (`guard.ts:53-54`). Frontera aceptada.
- `organizations` (raíz del tenant — su `id` *es* la org, no tiene
  `organization_id`), `signup_verifications` (pre-org, global), `platform_*`
  (global). Sin RLS por naturaleza.
- `checkin_idempotency`: evaluar en fase 2 (tiene org_id; bajo riesgo de PII).

---

## 3. Implementación de `withTenant()`

```ts
// packages/db/src/rls.ts (reemplaza el throw)
export async function withTenant<T>(
  db: Kysely<Database>,
  organizationId: string,
  fn: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    // set_config(name, value, is_local=true) === SET LOCAL, pero parametrizable.
    await sql`select set_config('app.organization_id', ${organizationId}, true)`
      .execute(trx);
    return fn(trx);
  });
}
```

Integración en rutas: el guard ya entrega `guard.ctx.org.id`. Cada handler
tenant-scoped envuelve sus queries:

```ts
const guard = await requireTenantStaff(db, req);
if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
const rows = await withTenant(db, guard.ctx.org.id, (trx) =>
  trx.selectFrom('users').selectAll().execute());  // el WHERE org_id deja de ser obligatorio
```

(El `WHERE organization_id` explícito puede quedarse como cinturón-y-tirantes;
no estorba.)

---

## 4. Rollout — fases seguras y reversibles

Cada fase es inerte o reversible; el enforcement real solo se activa en la 4.

| Fase | Qué | Impacto en prod | Rollback |
|------|-----|-----------------|----------|
| **0** | Implementar `withTenant()` en `packages/db`. Tests unitarios del helper. | Ninguno (no se usa aún) | revert commit |
| **1** | Migración: crea rol `app_v2` + `GRANT` DML en las 6 tablas + `ENABLE RLS` + `CREATE POLICY`. v2 **sigue en el rol owner** → policies en *shadow* (bypasseadas). | Ninguno (v2 bypassa por ser owner) | `DROP POLICY` / `DISABLE RLS` / `DROP ROLE` |
| **2** | Refactor: rutas tenant-scoped de v2 pasan por `withTenant(...)`. Sigue en owner → ejercitado pero inerte. | Ninguno funcional | revert commit |
| **3** | **Staging:** apuntar `DATABASE_URL` de v2-staging a `app_v2`. Correr suite completa + test cross-tenant RLS. Cualquier query sin `withTenant` que toque tabla con policy **falla (default-deny)** → se detecta acá, no en prod. | Solo staging | env var → rol owner |
| **4** | **Prod:** apuntar `DATABASE_URL` de v2-prod a `app_v2`. Monitorear. | **Enforcement activo** | **env var → rol owner (instantáneo, sin DDL)** |

Clave: el enforcement se prende con un **cambio de env var** (el rol de
conexión), no con el DDL. El DDL (fase 1) es inofensivo mientras v2 sea owner.
Eso hace el rollback de prod trivial: revertir la variable.

---

## 5. Verificación (test de aislamiento real)

Con el rol `app_v2` y dos orgs sembradas (ya existen en fixtures: `ccb` +
`test-tenant`):

```ts
// como app_v2, GUC = orgA
await withTenant(dbV2, orgA, async (trx) => {
  const rows = await trx.selectFrom('users').selectAll().execute();
  expect(rows.every(r => r.organization_id === orgA)).toBe(true); // cero filas de orgB
});
// WITH CHECK: insertar user con org de orgB estando en orgA → debe fallar
await expect(withTenant(dbV2, orgA, (trx) =>
  trx.insertInto('users').values({ organization_id: orgB, /* ... */ }).execute()
)).rejects.toThrow();
// Sin GUC → default-deny (cero filas)
```

---

## 6. Riesgos y mitigaciones

1. **Vía de aplicación del DDL:** las migraciones **solo las corre v1**
   (`backend/server.js` → `migrations.js`); api-v2 no migra. Aplicar la
   migración RLS implica **rebootear/redeploy de v1** (corre el runner) **o**
   un `psql` manual por un operador. → **Requiere tu OK** por tocar la DB de
   prod. *(Recomendado: aplicar por `psql` controlado en ventana, sin redeploy
   de v1, para no mover v1.)*
2. **Queries sin envolver fallan-cerrado tras fase 4:** es el punto — pero hay
   que garantizar que **todas** las queries tenant pasen por `withTenant` antes
   de virar el rol. La fase 3 en staging las caza (fallan ahí, no en prod).
3. **Tablas de auth excluidas:** frontera documentada (§2.3); el check app-level
   del guard ya cubre cross-org.
4. **Toda query tenant en transacción:** leve overhead; aceptable. Varios flujos
   ya usan transacción (checkin, delete).
5. **Mantenimiento:** cada tabla tenant nueva necesita `GRANT` a `app_v2` +
   `ENABLE RLS` + `CREATE POLICY`. Agregar a checklist de migraciones.
6. **Endpoints públicos (kiosko):** resuelven org por host vía `tenantOnly` →
   tienen `orgId` → también se envuelven en `withTenant(orgId)`. Sin problema.

---

## 7. Qué necesita tu OK explícito

- **Fase 1 y 4 tocan la DB/infra de prod** (crear rol + policies; cambiar el
  `DATABASE_URL` de v2-prod). Requieren autorización por-acción.
- Fases 0 y 2 son **solo código v2** (reversibles por revert), dentro de scope.

**Orden propuesto para empezar sin riesgo:** Fase 0 (implementar `withTenant` +
tests) y Fase 2 (refactor de rutas) son código puro y no cambian nada en prod.
Las dejo listas y revisadas; el viraje de rol (fases 1/3/4) se agenda contigo.
