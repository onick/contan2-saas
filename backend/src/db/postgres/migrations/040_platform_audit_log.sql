-- Migración: bitácora GLOBAL del super-admin de plataforma (cross-tenant).
-- Fuente de verdad de los actos del operador (suspender/reactivar/plan/trial/
-- notas, y a futuro login/crear tenant). Los actos que afectan a un tenant se
-- ESPEJAN además en tenant_audit_log (para que el propio tenant vea "por
-- plataforma" en su Historial). Append-only; sin PII en claro.

CREATE TABLE IF NOT EXISTS platform_audit_log (
  id BIGSERIAL PRIMARY KEY,
  platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
  actor_email_masked TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,              -- normalmente organizations.id
  target_label TEXT,
  metadata JSONB,
  ip_hash TEXT,
  ua TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_log(id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_target ON platform_audit_log(target_id);
