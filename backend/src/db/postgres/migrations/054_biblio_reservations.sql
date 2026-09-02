-- 054_biblio_reservations.sql · Módulo Biblioteca — F5 RESERVAS.
-- Reserva POR TÍTULO con cola FIFO + expiración (plan aprobado). Estados:
--   espera    → en la cola (posición DERIVADA por created_at)
--   lista     → hay copia apartada (ready_item_id) con ventana de retiro
--   cumplida  → se convirtió en préstamo (loan_id)
--   cancelada → la canceló el staff/lector
--   vencida   → no la retiró a tiempo (la promoción libera la copia)
-- La promoción es PEREZOSA (sin cron): corre en lecturas/escrituras del módulo
-- y al devolver ejemplares. seq → código legible R-000123.
-- SOLO STAGING por ahora. Idempotente. Rollback: DROP TABLE biblio_reservations;

CREATE TABLE IF NOT EXISTS biblio_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq BIGINT GENERATED ALWAYS AS IDENTITY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title_id UUID NOT NULL REFERENCES biblio_titles(id) ON DELETE CASCADE,
  -- users.id es TEXT en el padrón legacy (v1).
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'espera'
    CHECK (status IN ('espera', 'lista', 'cumplida', 'cancelada', 'vencida')),
  ready_item_id UUID REFERENCES biblio_items(id),
  ready_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,   -- ventana de retiro (solo en 'lista')
  fulfilled_at TIMESTAMPTZ,
  loan_id UUID REFERENCES biblio_loans(id),
  cancelled_at TIMESTAMPTZ,
  notes TEXT,
  created_by_staff_id UUID REFERENCES staff_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una reserva VIVA (espera|lista) por persona y título.
CREATE UNIQUE INDEX IF NOT EXISTS biblio_reservations_user_title_open_unique
  ON biblio_reservations (organization_id, title_id, user_id)
  WHERE status IN ('espera', 'lista');

-- Un ejemplar apartado por UNA sola reserva viva.
CREATE UNIQUE INDEX IF NOT EXISTS biblio_reservations_item_open_unique
  ON biblio_reservations (ready_item_id) WHERE status = 'lista';

CREATE INDEX IF NOT EXISTS biblio_reservations_org_status_idx
  ON biblio_reservations (organization_id, status);
CREATE INDEX IF NOT EXISTS biblio_reservations_org_title_idx
  ON biblio_reservations (organization_id, title_id, created_at)
  WHERE status IN ('espera', 'lista');

-- ── RLS tenant (patrón 047/050/052/053) ──────────────────────────────────────
ALTER TABLE biblio_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON biblio_reservations;
CREATE POLICY tenant_isolation ON biblio_reservations
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- ── Grant explícito a app_v2 ─────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_v2') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON biblio_reservations TO app_v2;
  END IF;
END
$$;
