-- ============================================================================
-- 014_staff_members · cuentas individuales del staff de un tenant
-- ============================================================================
-- Reemplaza gradualmente el PIN único compartido por identidad personal
-- (email + password). Cada staff pertenece a UNA organización. Email
-- único POR organización (mismo email en otra org es válido).
--
-- Estado actual del campo `status`:
--   active    → normal, puede loguear
--   suspended → tiene cuenta pero no puede loguear (acción de admin)
--   deleted   → soft-delete, registros mantenidos para audit/integridad
-- ============================================================================

-- Necesitamos citext para email case-insensitive (estándar para auth).
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS staff_members (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  email                CITEXT NOT NULL,
  password_hash        TEXT NOT NULL,
  full_name            TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','suspended','deleted')),
  -- Lockout tracking
  failed_attempts      INT NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ NULL,
  lock_level           INT NOT NULL DEFAULT 0 CHECK (lock_level BETWEEN 0 AND 3),
  last_attempt_at      TIMESTAMPTZ NULL,
  -- Flag para forzar cambio de password en primer login (cuentas migradas)
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  -- Hooks para futuro MFA (Sprint 4+). NULL hasta entonces.
  mfa_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret           TEXT NULL,
  -- Telemetría de último login (IP hasheada por privacy)
  last_login_at        TIMESTAMPTZ NULL,
  last_login_ip_hash   TEXT NULL,
  -- Timestamps + soft-delete
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ NULL
);

-- Email único por org (case-insensitive gracias a CITEXT)
CREATE UNIQUE INDEX IF NOT EXISTS staff_members_org_email_unique
  ON staff_members (organization_id, email)
  WHERE deleted_at IS NULL;

-- Index para queries por organización (admin de un tenant lista su staff)
CREATE INDEX IF NOT EXISTS staff_members_org_idx
  ON staff_members (organization_id)
  WHERE deleted_at IS NULL;
