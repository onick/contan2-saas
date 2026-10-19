-- scripts/staging/anonymize-padron.sql · anonimiza el padrón de STAGING (REP-A08 · P3).
--
-- USO (NO se ejecuta desde CI ni desde el repo; lo corre una persona en el VPS):
--   psql -U postgres -d postgres -v confirm=STAGING -f anonymize-padron.sql
--
-- Qué hace (idempotente: re-correrlo deja el mismo resultado):
--   users                     nombre -> 'Visitante' + NNNN; correo -> vNNNN@anon.local;
--                             teléfono -> 809-555-NNNN (los NULL siguen NULL). CONSERVA users.code
--                             (credenciales/QR), id, visit_count y toda la asistencia.
--   attendance.group_contact  -> NULL;  space_bookings.contact_* -> ficticios;  notas libres -> NULL.
-- El número NNNN es el rango por (organization_id, code): estable mientras no se agreguen filas.
--
-- GUARDAS (aborta TODO si falla alguna; corre en una sola transacción):
--   1. Debe pasarse -v confirm=STAGING.
--   2. current_database() debe ser 'postgres' (staging). Producción usa otra base/usuario.
--   3. Ninguna organización puede tener dominio propio verificado (señal de datos de producción).

\set ON_ERROR_STOP on
\if :{?confirm}
\else
  \echo 'ABORTADO: falta -v confirm=STAGING'
  \quit
\endif

BEGIN;

SELECT (:'confirm' = 'STAGING') AS confirm_ok,
       (current_database() = 'postgres') AS db_ok,
       NOT EXISTS (SELECT 1 FROM organizations WHERE custom_domain_verified_at IS NOT NULL) AS no_custom_domain
\gset

\if :confirm_ok
\else
  \echo 'ABORTADO: confirm debe ser STAGING'
  ROLLBACK;
  \quit
\endif
\if :db_ok
\else
  \echo 'ABORTADO: la base actual no es la de staging (postgres)'
  ROLLBACK;
  \quit
\endif
\if :no_custom_domain
\else
  \echo 'ABORTADO: hay organizaciones con dominio propio verificado (parece producción)'
  ROLLBACK;
  \quit
\endif

-- Superusuario de staging: ignora RLS. Por si no lo fuera, desactivar para esta transacción.
SET LOCAL row_security = off;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY organization_id, code) AS n FROM users
)
UPDATE users u SET
  first_name = 'Visitante',
  last_name  = lpad(r.n::text, 4, '0'),
  email      = CASE WHEN u.email IS NULL THEN NULL ELSE 'v' || lpad(r.n::text, 4, '0') || '@anon.local' END,
  phone      = CASE WHEN u.phone IS NULL THEN NULL ELSE '809-555-' || lpad((r.n % 10000)::text, 4, '0') END
FROM ranked r
WHERE r.id = u.id;

UPDATE attendance SET group_contact = NULL WHERE group_contact IS NOT NULL;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY organization_id, id) AS n FROM space_bookings
)
UPDATE space_bookings b SET
  contact_name  = CASE WHEN b.contact_name  IS NULL THEN NULL ELSE 'Contacto ' || lpad(r.n::text, 4, '0') END,
  contact_email = CASE WHEN b.contact_email IS NULL THEN NULL ELSE 'c' || lpad(r.n::text, 4, '0') || '@anon.local' END,
  contact_phone = CASE WHEN b.contact_phone IS NULL THEN NULL ELSE '809-555-' || lpad((r.n % 10000)::text, 4, '0') END,
  notes         = NULL
FROM ranked r
WHERE r.id = b.id;

UPDATE protocol_profiles SET notes = NULL WHERE notes IS NOT NULL;

-- Verificación: ningún correo ni teléfono fuera del patrón ficticio.
SELECT count(*) = 0 AS todo_ok FROM users
 WHERE (email IS NOT NULL AND email NOT LIKE '%@anon.local')
    OR (phone IS NOT NULL AND phone NOT LIKE '809-555-%')
\gset
\if :todo_ok
\else
  \echo 'VERIFICACIÓN FALLÓ: usuarios sin anonimizar'
  ROLLBACK;
  \quit
\endif

COMMIT;
\echo 'Padrón anonimizado. users.code conservado.'
