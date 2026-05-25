-- ============================================================================
-- 017_platform_admins · super admins de la plataforma (cross-tenant)
-- ============================================================================
-- Marcelino (y futuros operadores de contan2). NO pertenecen a ninguna
-- organización. Loguean en admin.contan2.com. Pueden ver/gestionar
-- todos los tenants.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_admins (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                CITEXT NOT NULL,
  password_hash        TEXT NOT NULL,
  full_name            TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','suspended','deleted')),
  -- Lockout tracking (mismo schema que staff_members)
  failed_attempts      INT NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ NULL,
  lock_level           INT NOT NULL DEFAULT 0 CHECK (lock_level BETWEEN 0 AND 3),
  last_attempt_at      TIMESTAMPTZ NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret           TEXT NULL,
  last_login_at        TIMESTAMPTZ NULL,
  last_login_ip_hash   TEXT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ NULL
);

-- Email único GLOBAL (no por tenant — esto NO es tenant scope)
CREATE UNIQUE INDEX IF NOT EXISTS platform_admins_email_unique
  ON platform_admins (email)
  WHERE deleted_at IS NULL;
