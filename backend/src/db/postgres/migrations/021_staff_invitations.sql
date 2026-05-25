-- ============================================================================
-- 021_staff_invitations · onboarding de staff vía email + token
-- ============================================================================
-- El admin (owner/admin) invita por email indicando rol. El sistema
-- genera un token opaco (32 bytes hex) que viaja en el link del email
-- y guardamos sha256. La invitación expira en 24h.
--
-- Estados:
--   pending  → activa, esperando aceptación
--   accepted → la persona la aceptó, ya tiene cuenta `active`
--   revoked  → un admin la canceló antes de que la aceptaran
--   expired  → pasó el `expires_at` sin aceptarse (status se cambia en
--              lectura/cron, no automáticamente al consultar)
--
-- Regla: máximo 1 invitación `pending` por (org, email). Re-invitar
-- revoca la anterior (lo hace el handler aplicativo, no la DB).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS staff_invitations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email                CITEXT NOT NULL,
  role                 TEXT NOT NULL CHECK (role IN ('owner','admin','operator')),
  full_name            TEXT NULL,
  token_hash           TEXT NOT NULL UNIQUE,
  invited_by_staff_id  UUID NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  expires_at           TIMESTAMPTZ NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','accepted','revoked','expired')),
  accepted_by_staff_id UUID NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  accepted_at          TIMESTAMPTZ NULL,
  revoked_at           TIMESTAMPTZ NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_pending_unique
  ON staff_invitations (organization_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS staff_invitations_org_idx
  ON staff_invitations (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS staff_invitations_status_idx
  ON staff_invitations (status, expires_at);
