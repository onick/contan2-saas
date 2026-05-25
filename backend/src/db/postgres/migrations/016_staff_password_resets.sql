-- ============================================================================
-- 016_staff_password_resets · tokens de recovery para staff
-- ============================================================================
-- Flujo: usuario pide forgot → generamos token (32 bytes random) →
-- guardamos solo el sha256 → enviamos link con el token plano por email.
-- TTL 1h. Un solo uso (used_at se setea al consumir).
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_password_resets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id       UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  token_hash            TEXT NOT NULL UNIQUE,
  expires_at            TIMESTAMPTZ NOT NULL,
  used_at               TIMESTAMPTZ NULL,
  requested_ip_hash     TEXT NULL,
  requested_user_agent  TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_password_resets_token_hash_idx
  ON staff_password_resets (token_hash)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS staff_password_resets_member_idx
  ON staff_password_resets (staff_member_id, created_at DESC);
