-- =============================================================================
-- 048_app_v2_grants · privilegios de tabla para el rol app_v2 (Chunk C / Fase 2)
--
-- La 047 creó app_v2 + RLS en las 6 tablas tenant, pero solo le dio GRANT a esas
-- 6. Cuando api-v2 conecte como app_v2 (Fase 3/4), TODA query corre como app_v2,
-- no solo las de las 6 tablas: la app también lee organizations, staff_members,
-- staff_invitations, programs, space_bookings, checkin_idempotency, etc. Sin
-- GRANT sobre ellas, esas queries fallan con "permission denied for table".
--
-- Modelo de seguridad (dos capas, independientes):
--   · GRANT (nivel tabla)  → CONTROLA EL ACCESO. app_v2 necesita DML en todas las
--     tablas que la app toca. Damos blanket sobre el esquema public.
--   · RLS  (nivel fila)    → CONTROLA QUÉ FILAS. Solo las 6 tablas tenant tienen
--     policy `tenant_isolation` (047). El blanket GRANT NO afecta el aislamiento:
--     app_v2 igual solo ve/escribe filas de su org en esas 6 (RLS manda).
--
-- Por qué blanket (ON ALL TABLES) y no enumerar: (1) evita "permission denied"
-- por olvidar una tabla; (2) ALTER DEFAULT PRIVILEGES cubre tablas futuras que
-- cree el owner (v1) → una tabla nueva NO rompe app_v2 ni exige tocar esta mig.
-- El aislamiento tenant lo sigue garantizando RLS, no la lista de grants.
--
-- Frontera aceptada (igual que 047 §2.3): staff_members/organizations NO tienen
-- RLS; app_v2 puede leerlas cross-org, pero el guard app-level ya arbitra la org.
-- El super-admin (platform-admin, lecturas cross-org de las 6 tablas) NO usa
-- app_v2: usa un pool elevado (owner/bypass) — ver packages/db getPlatformDb().
--
-- Idempotente: GRANT y ALTER DEFAULT PRIVILEGES son declarativos y re-aplicables.
-- Rollback: REVOKE ... FROM app_v2; ALTER DEFAULT PRIVILEGES ... REVOKE ...;
-- =============================================================================

-- Acceso a las tablas actuales del esquema (incluye las 6 de la 047; re-grant
-- inofensivo).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_v2;

-- Secuencias (BIGSERIAL como tenant_audit_log.id, y cualquier otra).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_v2;

-- Tablas/secuencias FUTURAS que cree el owner (el rol que corre las migraciones
-- de v1). Sin esto, cada tabla nueva volvería a dar "permission denied" a app_v2.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_v2;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_v2;
