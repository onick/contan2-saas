-- ============================================================================
-- 019_platform_password_resets · recovery tokens para platform_admins
-- ============================================================================
-- Schema idéntico a staff_password_resets.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_password_resets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id     UUID NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  token_hash            TEXT NOT NULL UNIQUE,
  expires_at            TIMESTAMPTZ NOT NULL,
  used_at               TIMESTAMPTZ NULL,
  requested_ip_hash     TEXT NULL,
  requested_user_agent  TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_password_resets_token_hash_idx
  ON platform_password_resets (token_hash)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS platform_password_resets_admin_idx
  ON platform_password_resets (platform_admin_id, created_at DESC);
