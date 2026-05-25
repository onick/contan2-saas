-- ============================================================================
-- 015_staff_auth_sessions · sesiones activas de staff_members
-- ============================================================================
-- Token plano (64 hex chars) en cookie HttpOnly; en DB solo el sha256.
-- TTL: 12h default, 30 días con rememberMe.
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_auth_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  remember_me     BOOLEAN NOT NULL DEFAULT FALSE,
  ip_hash         TEXT NULL,
  user_agent      TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ NULL
);

-- Lookup principal: cada request del frontend hace findByTokenHash
CREATE INDEX IF NOT EXISTS staff_auth_sessions_token_hash_idx
  ON staff_auth_sessions (token_hash)
  WHERE revoked_at IS NULL;

-- Para listar sesiones de un usuario y revocar todas (post password change)
CREATE INDEX IF NOT EXISTS staff_auth_sessions_member_active_idx
  ON staff_auth_sessions (staff_member_id)
  WHERE revoked_at IS NULL;
