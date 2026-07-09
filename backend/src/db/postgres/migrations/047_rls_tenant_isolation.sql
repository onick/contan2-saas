-- =============================================================================
-- 047_rls_tenant_isolation · RLS por tenant para v2 (defensa en profundidad)
--
-- Crea el rol least-privilege `app_v2` y habilita Row-Level Security en las
-- tablas tenant-owned de alto valor:
--   users, activities, attendance, invitations, tenant_audit_log,
--   protocol_profiles.
--
-- Se usa ENABLE ROW LEVEL SECURITY SIN FORCE a propósito: v1 sigue conectando
-- como el dueño de las tablas y debe continuar bypasseando las policies durante
-- la convivencia. El enforcement real se activa cuando api-v2 conecta como
-- `app_v2` y usa `withTenant()` para setear `app.organization_id` por
-- transacción.
--
-- Alcance: solo tablas con organization_id. Excluye tablas globales, raíz de
-- tenant y auth legacy que resuelven sesión antes de tener contexto de org.
--
-- Por qué NULLIF(current_setting('app.organization_id', true), ''): un GUC
-- custom, una vez seteado con SET LOCAL en la sesión, al salir de la
-- transacción NO vuelve a NULL sino a string vacío ''. Sin el NULLIF, '' ::uuid
-- LANZA "invalid input syntax for type uuid" en vez de dar default-deny. Con
-- NULLIF, '' → NULL → ninguna fila matchea → default-deny limpio (0 filas).
--
-- Rollback:
--   DROP POLICY IF EXISTS tenant_isolation ON <tabla>;
--   ALTER TABLE <tabla> DISABLE ROW LEVEL SECURITY;
--   REVOKE ... FROM app_v2;
--   DROP ROLE IF EXISTS app_v2;
--
-- Idempotente: DROP POLICY IF EXISTS antes de crear, GRANT/ALTER repetibles.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_v2') THEN
    CREATE ROLE app_v2 NOLOGIN;
  END IF;
END
$$;

-- NO re-assertar NOLOGIN acá: el LOGIN de app_v2 se provisiona en el viraje de
-- rol (Fase 3/4, ALTER ROLE app_v2 LOGIN PASSWORD '<secreto>' por infra, fuera de
-- git). Si esta migración forzara NOLOGIN, una re-corrida (DB nueva, refresh de
-- staging, pérdida de _migrations) dejaría a v2 sin poder conectar. Solo fijamos
-- NOBYPASSRLS (invariante de seguridad: app_v2 nunca debe saltear las policies).
ALTER ROLE app_v2 NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO app_v2;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  users,
  activities,
  attendance,
  invitations,
  tenant_audit_log,
  protocol_profiles
TO app_v2;

-- tenant_audit_log.id es BIGSERIAL. Las otras tablas en alcance usan IDs
-- generados por la app, UUID DEFAULT gen_random_uuid() o PK compuesta.
GRANT USAGE ON SEQUENCE tenant_audit_log_id_seq TO app_v2;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON activities;
CREATE POLICY tenant_isolation ON activities
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON attendance;
CREATE POLICY tenant_isolation ON attendance
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON invitations;
CREATE POLICY tenant_isolation ON invitations
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE tenant_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_audit_log;
CREATE POLICY tenant_isolation ON tenant_audit_log
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE protocol_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON protocol_profiles;
CREATE POLICY tenant_isolation ON protocol_profiles
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
