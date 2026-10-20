# Runbook · migración 057 `sala_kind` (PR-P6 · PUE-A09)

Qué hace (una transacción, idempotente): agrega a `activities` las columnas `sala_kind`
(`exposicion|vr|otra`, NULL en actividades con fecha), `has_agenda` (default false) y `aforo`
(NULL = sin límite), con sus CHECK, y hace el backfill de las salas permanentes.
`activities.capacity` **no cambia**: en los eventos sigue siendo el cupo y en las salas queda como
valor técnico (100000) que el código ya no interpreta como tipo. El aforo real de la sala es `aforo`.

## 1. ANTES (solo lectura)

```sql
SELECT organization_id, id, name, capacity, audience, status, is_permanent
  FROM activities WHERE is_permanent = true ORDER BY organization_id, name;
```

Esperado (staging y prod, CCB): Ada Balcácer (`capacity` 100000) y Sala VR (`capacity` 8).

## 2. Aplicar

Staging / prod (el VPS; no desde el repo):

```bash
scp backend/src/db/postgres/migrations/057_sala_kind.sql <vps>:/root/
docker exec -i <contenedor-postgres> psql -U <usuario> -d <base> -v ON_ERROR_STOP=1 < /root/057_sala_kind.sql
```

Local de pruebas:

```bash
docker exec -i contan2-postgres-test psql -U test -d contan2_test -v ON_ERROR_STOP=1 \
  < backend/src/db/postgres/migrations/057_sala_kind.sql
```

## 3. Verificar

```sql
SELECT id FROM _migrations WHERE id = '057_sala_kind';                                  -- 1 fila
SELECT name, sala_kind, has_agenda, aforo FROM activities WHERE is_permanent = true ORDER BY name;
-- Ada Balcácer | exposicion | f | NULL
-- Sala VR      | vr         | t | 8
SELECT count(*) FROM activities WHERE is_permanent = true AND sala_kind IS NULL;        -- 0
SELECT conname FROM pg_constraint WHERE conname IN ('activities_sala_kind_check','activities_aforo_check'); -- 2
```

## Rollback

```sql
BEGIN;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_sala_kind_check;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_aforo_check;
ALTER TABLE activities DROP COLUMN IF EXISTS sala_kind;
ALTER TABLE activities DROP COLUMN IF EXISTS has_agenda;
ALTER TABLE activities DROP COLUMN IF EXISTS aforo;
DELETE FROM _migrations WHERE id = '057_sala_kind';
COMMIT;
```

Las columnas son aditivas: se pueden dejar. Pero el código nuevo las LEE: volver a un api-v2 anterior
funciona con las columnas presentes; **borrarlas con el api-v2 nuevo desplegado lo rompe**.

Orden de despliegue: **DB (057) primero, luego api-v2 y web**. Una sala permanente creada después sin
`sala_kind` se trata como `otra` sin agenda (hasta que exista la pantalla de configuración, PR-P9,
se fija con SQL).
