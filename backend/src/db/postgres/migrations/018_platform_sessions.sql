-- ============================================================================
-- 018_platform_sessions · sesiones activas de platform_admins
-- ============================================================================
-- Schema idéntico a staff_sessions, FK distinta. Cookie distinta también
-- (contan2_admin_session) para no confundir con cookies de tenant.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id  UUID NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  token_hash         TEXT NOT NULL UNIQUE,
  expires_at         TIMESTAMPTZ NOT NULL,
  remember_me        BOOLEAN NOT NULL DEFAULT FALSE,
  ip_hash            TEXT NULL,
  user_agent         TEXT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at         TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS platform_sessions_token_hash_idx
  ON platform_sessions (token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS platform_sessions_admin_active_idx
  ON platform_sessions (platform_admin_id)
  WHERE revoked_at IS NULL;
