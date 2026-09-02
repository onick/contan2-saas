-- 052_biblio_member_profiles.sql · Módulo Biblioteca — Lectores (modelo
-- aprobado por el usuario). Decisión cerrada 2026-08-08: el LECTOR ES EL
-- PADRÓN del centro (tabla users, mismo carné QR); este perfil agrega SOLO lo
-- bibliotecario encima: tipo de lector (empleado/no_empleado, con código RRHH),
-- cédula/documento, observaciones y suspensión del servicio de biblioteca
-- (independiente del archivado del padrón).
-- SOLO STAGING por ahora (la Biblioteca no toca producción sin OK explícito).
-- Idempotente. Rollback: DROP TABLE biblio_member_profiles; (sin datos → seguro).

CREATE TABLE IF NOT EXISTS biblio_member_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- users.id es TEXT en el padrón legacy (v1) — no UUID.
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reader_type TEXT NOT NULL DEFAULT 'no_empleado'
    CHECK (reader_type IN ('empleado', 'no_empleado')),
  employee_code TEXT,       -- código RRHH (solo empleados)
  document TEXT,            -- cédula / documento de identidad
  notes TEXT,               -- observaciones de biblioteca
  suspended_at TIMESTAMPTZ, -- NULL = servicio activo
  suspended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT biblio_member_profiles_user_unique UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS biblio_member_profiles_org_idx
  ON biblio_member_profiles (organization_id);
CREATE INDEX IF NOT EXISTS biblio_member_profiles_doc_idx
  ON biblio_member_profiles (organization_id, document);

-- ── RLS tenant (patrón 047/050; el GUC lo setea withTenant) ──────────────────
ALTER TABLE biblio_member_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON biblio_member_profiles;
CREATE POLICY tenant_isolation ON biblio_member_profiles
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- ── Grant explícito a app_v2 (cinturón además de los defaults de la 048) ─────
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_v2') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON biblio_member_profiles TO app_v2;
  END IF;
END
$$;
