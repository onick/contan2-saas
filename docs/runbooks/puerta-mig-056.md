# Runbook · migración 056 `puerta_bookings_integrity` (PR-P3)

Qué hace (una transacción, idempotente): limpia reservas huérfanas de `space_bookings`, agrega la FK
`attendance_id → attendance(id) ON DELETE SET NULL`, las columnas `email_error`, `cancelled_at`,
`no_show_at`, `rescheduled_from`, un trigger que devuelve la reserva a `confirmed` cuando se borra su
asistencia, RLS `tenant_isolation` en `space_bookings` y el índice `(organization_id, activity_id, scheduled_at)`.

## 1. ANTES: cuántas filas afecta la limpieza (solo lectura)

```sql
SELECT b.id, b.organization_id, b.colegio, b.scheduled_at, b.status, b.student_count, b.attendance_id
  FROM space_bookings b
 WHERE b.attendance_id IS NOT NULL
   AND b.attendance_id NOT IN (SELECT id FROM attendance);
```

Esperado en staging: la reserva de julio (Sala VR, 200 alumnos, `attended`) que alimenta el embudo con
"Asistieron 1 · Personas esperadas 201". Pasa a `confirmed` con `attendance_id = NULL`. **Se aplica con OK del dueño.**
Pega el resultado del SELECT en el informe antes de correrla.

## 2. Aplicar

Staging / prod (el VPS; no desde el repo):

```bash
scp backend/src/db/postgres/migrations/056_puerta_bookings_integrity.sql <vps>:/root/
docker exec -i <contenedor-postgres> psql -U <usuario> -d <base> -v ON_ERROR_STOP=1 < /root/056_puerta_bookings_integrity.sql
```

Local de pruebas:

```bash
docker exec -i contan2-postgres-test psql -U test -d contan2_test -v ON_ERROR_STOP=1 \
  < backend/src/db/postgres/migrations/056_puerta_bookings_integrity.sql
```

## 3. Verificar

```sql
SELECT id FROM _migrations WHERE id = '056_puerta_bookings_integrity';                    -- 1 fila
SELECT conname FROM pg_constraint WHERE conname = 'space_bookings_attendance_fk';         -- 1 fila
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'space_bookings' AND column_name IN ('email_error','cancelled_at','no_show_at','rescheduled_from'); -- 4
SELECT policyname FROM pg_policies WHERE tablename = 'space_bookings';                    -- tenant_isolation
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_space_bookings_attendance_delete';      -- 1 fila
-- Cero huérfanos:
SELECT count(*) FROM space_bookings WHERE attendance_id IS NOT NULL AND attendance_id NOT IN (SELECT id FROM attendance); -- 0
```

## Rollback

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_space_bookings_attendance_delete ON attendance;
DROP FUNCTION IF EXISTS space_bookings_on_attendance_delete();
ALTER TABLE space_bookings DROP CONSTRAINT IF EXISTS space_bookings_attendance_fk;
DROP POLICY IF EXISTS tenant_isolation ON space_bookings;
ALTER TABLE space_bookings DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_space_bookings_org_sala_day;
-- Las columnas son aditivas; se pueden dejar. La limpieza de huérfanos no se revierte.
DELETE FROM _migrations WHERE id = '056_puerta_bookings_integrity';
COMMIT;
```

Orden de despliegue: **DB (056) primero, luego api-v2**. El código nuevo escribe `email_error`, `cancelled_at`,
`no_show_at` y `rescheduled_from`: sin la migración, los PATCH de la agenda fallan.
