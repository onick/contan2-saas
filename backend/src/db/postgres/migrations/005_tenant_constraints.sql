-- =============================================================================
-- 005_tenant_constraints · sella el aislamiento por tenant.
-- - organization_id NOT NULL en tablas de negocio
-- - Drop de índices legacy (code, email globales)
-- - Crea índices tenant-scoped
-- - Unique (org_id, code) y (org_id, lower(email))
-- =============================================================================

-- Sellar NOT NULL
ALTER TABLE users        ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE activities   ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE attendance   ALTER COLUMN organization_id SET NOT NULL;

-- Drop índices/constraints globales (legacy single-tenant)
DROP INDEX IF EXISTS users_code_unique_legacy;
DROP INDEX IF EXISTS users_email_lower_unique_legacy;
DROP INDEX IF EXISTS attendance_user_activity_unique_legacy;

-- Si en 001 antiguo había unique index ON users(code) sin condición,
-- también limpiamos por nombre por si quedó como users_code_key
DROP INDEX IF EXISTS users_code_key;

-- Unicidad nueva: scoped por organización
CREATE UNIQUE INDEX IF NOT EXISTS users_org_code_unique
  ON users (organization_id, code);

CREATE UNIQUE INDEX IF NOT EXISTS users_org_email_lower_unique
  ON users (organization_id, LOWER(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_org_user_activity_unique
  ON attendance (organization_id, user_id, activity_id);

-- Índices de query (todos empiezan con organization_id)
CREATE INDEX IF NOT EXISTS users_org_created_idx
  ON users (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activities_org_status_date_idx
  ON activities (organization_id, status, date);

CREATE INDEX IF NOT EXISTS activities_org_type_idx
  ON activities (organization_id, type);

CREATE INDEX IF NOT EXISTS attendance_org_user_idx
  ON attendance (organization_id, user_id);

CREATE INDEX IF NOT EXISTS attendance_org_activity_idx
  ON attendance (organization_id, activity_id);

CREATE INDEX IF NOT EXISTS attendance_org_registered_idx
  ON attendance (organization_id, registered_at DESC);
