-- 055_biblio_inventories.sql · Módulo Biblioteca — F6 INVENTARIO físico.
-- Sesiones de conteo: se abre un inventario (todo el acervo o un sitio), se
-- ESCANEAN ejemplares uno a uno y el RESULTADO se deriva:
--   escaneado en su sitio        → encontrado
--   escaneado en otro sitio      → fuera_ubicacion (found_site_id ≠ registrado)
--   sin escanear, CON préstamo   → prestado (no es faltante: está en la calle)
--   sin escanear, sin préstamo   → pendiente (sesión abierta) / faltante (cerrada)
-- Al finalizar se congela el resumen en la sesión (para "anteriores").
-- SOLO STAGING por ahora. Idempotente. Rollback: DROP TABLE biblio_inventory_scans, biblio_inventories;

CREATE TABLE IF NOT EXISTS biblio_inventories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  site_id UUID REFERENCES biblio_sites(id),  -- NULL = todo el acervo
  status TEXT NOT NULL DEFAULT 'en_progreso'
    CHECK (status IN ('en_progreso', 'finalizado', 'cancelado')),
  started_by_staff_id UUID REFERENCES staff_members(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  -- Resumen congelado al finalizar (derivado en vivo mientras está abierta).
  expected_count INTEGER,
  scanned_count INTEGER,
  found_count INTEGER,
  misplaced_count INTEGER,
  missing_count INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un solo inventario EN PROGRESO por organización.
CREATE UNIQUE INDEX IF NOT EXISTS biblio_inventories_org_open_unique
  ON biblio_inventories (organization_id) WHERE status = 'en_progreso';

CREATE TABLE IF NOT EXISTS biblio_inventory_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES biblio_inventories(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES biblio_items(id) ON DELETE CASCADE,
  found_site_id UUID REFERENCES biblio_sites(id), -- dónde apareció físicamente
  misplaced BOOLEAN NOT NULL DEFAULT false,       -- ≠ ubicación registrada
  scanned_by_staff_id UUID REFERENCES staff_members(id),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT biblio_inventory_scans_unique UNIQUE (inventory_id, item_id)
);

CREATE INDEX IF NOT EXISTS biblio_inventory_scans_org_inv_idx
  ON biblio_inventory_scans (organization_id, inventory_id);

-- ── RLS tenant (patrón 047/050/052/053/054) ──────────────────────────────────
ALTER TABLE biblio_inventories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON biblio_inventories;
CREATE POLICY tenant_isolation ON biblio_inventories
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE biblio_inventory_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON biblio_inventory_scans;
CREATE POLICY tenant_isolation ON biblio_inventory_scans
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- ── Grants explícitos a app_v2 ───────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_v2') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON biblio_inventories, biblio_inventory_scans TO app_v2;
  END IF;
END
$$;
