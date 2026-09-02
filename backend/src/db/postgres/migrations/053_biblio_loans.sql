-- 053_biblio_loans.sql · Módulo Biblioteca — F2 CIRCULACIÓN (el corazón).
-- Ledger INMUTABLE de préstamos (plan aprobado): cada fila es un préstamo;
-- "vencido" se DERIVA (due_at < now() y returned_at IS NULL), nunca es flag.
-- kind: 'domicilio' (se lleva el material) | 'sala' (consulta interna, vence
-- el mismo día). Renovaciones extienden due_at e incrementan el contador.
-- SOLO STAGING por ahora (la Biblioteca no toca producción sin OK explícito).
-- Idempotente. Rollback: DROP TABLE biblio_loans; (sin datos → seguro).

CREATE TABLE IF NOT EXISTS biblio_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES biblio_items(id) ON DELETE RESTRICT,
  -- users.id es TEXT en el padrón legacy (v1).
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL DEFAULT 'domicilio' CHECK (kind IN ('domicilio', 'sala')),
  loaned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ NOT NULL,
  renewals INTEGER NOT NULL DEFAULT 0 CHECK (renewals >= 0),
  returned_at TIMESTAMPTZ,
  notes TEXT,
  created_by_staff_id UUID REFERENCES staff_members(id),
  returned_by_staff_id UUID REFERENCES staff_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un ejemplar solo puede tener UN préstamo abierto a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS biblio_loans_item_open_unique
  ON biblio_loans (item_id) WHERE returned_at IS NULL;

CREATE INDEX IF NOT EXISTS biblio_loans_org_open_idx
  ON biblio_loans (organization_id, returned_at);
CREATE INDEX IF NOT EXISTS biblio_loans_org_user_idx
  ON biblio_loans (organization_id, user_id);
CREATE INDEX IF NOT EXISTS biblio_loans_org_due_idx
  ON biblio_loans (organization_id, due_at) WHERE returned_at IS NULL;

-- ── RLS tenant (patrón 047/050/052; el GUC lo setea withTenant) ──────────────
ALTER TABLE biblio_loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON biblio_loans;
CREATE POLICY tenant_isolation ON biblio_loans
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- ── Grant explícito a app_v2 (cinturón además de los defaults de la 048) ─────
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_v2') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON biblio_loans TO app_v2;
  END IF;
END
$$;
