-- ============================================================================
-- 022_audit_log · bitácora append-only de eventos por tenant
-- ============================================================================
-- Tabla append-only. Nunca se borra ni se modifica desde la aplicación.
-- Cualquier query desde el admin del tenant DEBE filtrar por
-- organization_id (cross-tenant queda solo para platform admin, futuro
-- Sprint 5).
--
-- Catálogo inicial de `action` (extensible):
--   auth.login                · ok
--   auth.login_failed         · email no existe, pass mala, lockout
--   auth.logout
--   auth.password_changed
--   auth.password_reset_used
--   staff.invited
--   staff.invitation_revoked
--   staff.invitation_resent
--   staff.invite_accepted
--   staff.role_changed
--   staff.suspended
--   staff.reactivated
--   staff.deleted
--   activity.created
--   activity.cancelled
--   branding.updated
--   domain.requested
--   domain.verified
--
-- `actor_email_masked` se calcula al insert (no por join) para que el log
-- siga siendo legible aunque el staff se borre después.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_staff_id      UUID NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  actor_email_masked  TEXT NULL,
  actor_role          TEXT NULL,
  action              TEXT NOT NULL,
  target_type         TEXT NULL,
  target_id           TEXT NULL,
  target_label        TEXT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash             TEXT NULL,
  ua                  TEXT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_org_time_idx
  ON audit_log (organization_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS audit_log_org_action_idx
  ON audit_log (organization_id, action);

CREATE INDEX IF NOT EXISTS audit_log_org_actor_idx
  ON audit_log (organization_id, actor_staff_id)
  WHERE actor_staff_id IS NOT NULL;
