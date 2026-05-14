-- =============================================================================
-- 006_invitations_and_checkin · sistema de RSVP
-- - Tabla invitations (pre-evento)
-- - attendance.checked_in_at (post-check-in)
-- - Backfill: registros existentes son todos check-ins reales
-- =============================================================================

CREATE TABLE IF NOT EXISTS invitations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  activity_id       TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token             TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'declined', 'expired', 'canceled')),
  sent_at           TIMESTAMPTZ,
  responded_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS invitations_org_activity_idx
  ON invitations (organization_id, activity_id);
CREATE INDEX IF NOT EXISTS invitations_token_idx
  ON invitations (token);
CREATE INDEX IF NOT EXISTS invitations_org_user_idx
  ON invitations (organization_id, user_id);
CREATE INDEX IF NOT EXISTS invitations_status_idx
  ON invitations (organization_id, status);

-- attendance ahora distingue entre "registrado" (RSVP confirmado o creación) y "vino"
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- Backfill: para registros existentes (sin RSVP previo), todos son check-ins reales.
-- registered_at era el timestamp de la asistencia real.
UPDATE attendance
   SET checked_in_at = registered_at
 WHERE checked_in_at IS NULL;

-- Índice para consultas de stats post-evento ("asistieron" = checked_in_at NOT NULL)
CREATE INDEX IF NOT EXISTS attendance_checked_in_idx
  ON attendance (organization_id, activity_id)
  WHERE checked_in_at IS NOT NULL;
