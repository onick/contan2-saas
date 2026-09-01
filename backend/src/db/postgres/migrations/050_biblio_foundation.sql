-- =============================================================================
-- 050_biblio_foundation · Módulo Biblioteca F1: catálogo (ADITIVA)
--
-- Plan: docs/plan-modulo-biblioteca.md. Decisiones D1/D3/D8/D9:
--   · biblio_titles (obra bibliográfica) 1—N biblio_items (ejemplares): cada
--     copia con código de inventario propio, ubicación sitio→estante, estado
--     físico e historial. La DISPONIBILIDAD es derivada (préstamos, F2) — acá
--     solo vive el estado FÍSICO explícito.
--   · biblio_sites: sitios físicos del tenant (CCB: Biblioteca, Censo Pérez,
--     Almacén KM23) — tabla editable, se siembra por tenant (data, no schema).
--   · biblio_isbn_cache: metadata pública por ISBN (OpenLibrary/Google Books),
--     GLOBAL (sin organization_id, sin RLS): un ISBN es el mismo para todos.
--
-- Búsqueda: pg_trgm (6,000+ títulos y creciendo) sobre el título normalizado.
-- RLS: tenant_isolation en las 3 tablas tenant (patrón 047, mismo GUC). Los
-- GRANTs a app_v2 los cubre el ALTER DEFAULT PRIVILEGES de la 048; se
-- re-asserta explícito por si esta mig corre con otro owner.
--
-- Idempotente: IF NOT EXISTS en todo; policies con DROP IF EXISTS.
-- Rollback: DROP TABLE biblio_items, biblio_titles, biblio_sites,
--           biblio_isbn_cache; (sin datos aún → seguro).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Sitios físicos ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biblio_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS biblio_sites_org_name_unique
  ON biblio_sites (organization_id, lower(name));

-- ── Títulos (obras bibliográficas) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biblio_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  kind TEXT NOT NULL DEFAULT 'libro'
    CHECK (kind IN ('libro', 'revista', 'periodico', 'tesis', 'audiovisual', 'documento')),
  isbn TEXT,
  issn TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  authors JSONB NOT NULL DEFAULT '[]'::jsonb,      -- ["Apellido, Nombre", …]
  publisher TEXT,
  year INT,
  edition TEXT,
  language TEXT,
  subjects TEXT[] NOT NULL DEFAULT '{}',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  dewey TEXT,
  call_number TEXT,                                 -- signatura topográfica base
  description TEXT,
  cover_url TEXT,
  isbn_autofilled BOOLEAN NOT NULL DEFAULT FALSE,   -- la ficha vino del ISBN (D8)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS biblio_titles_org_alive_idx
  ON biblio_titles (organization_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS biblio_titles_org_isbn_idx
  ON biblio_titles (organization_id, isbn) WHERE isbn IS NOT NULL;
-- Búsqueda difusa por título+subtítulo (pg_trgm; la app normaliza acentos aparte).
CREATE INDEX IF NOT EXISTS biblio_titles_search_trgm
  ON biblio_titles USING gin ((lower(title || ' ' || coalesce(subtitle, ''))) gin_trgm_ops);

-- ── Ejemplares (copias físicas) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biblio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  title_id UUID NOT NULL REFERENCES biblio_titles(id),
  inventory_code TEXT NOT NULL,                     -- código de barras / inventario
  site_id UUID REFERENCES biblio_sites(id),
  shelf TEXT,                                       -- estante / depósito / caja (D9)
  collection TEXT,
  call_number TEXT,                                 -- signatura propia (si difiere)
  physical_status TEXT NOT NULL DEFAULT 'bueno'
    CHECK (physical_status IN ('bueno', 'deteriorado', 'reparacion', 'perdido', 'baja')),
  loanable BOOLEAN NOT NULL DEFAULT TRUE,           -- false = solo consulta en sala
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,                           -- baja lógica (historial intacto)
  retired_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS biblio_items_org_code_unique
  ON biblio_items (organization_id, upper(inventory_code));
CREATE INDEX IF NOT EXISTS biblio_items_title_idx ON biblio_items (title_id);
CREATE INDEX IF NOT EXISTS biblio_items_org_site_idx ON biblio_items (organization_id, site_id);

-- ── Cache global de metadata por ISBN (D8) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS biblio_isbn_cache (
  isbn TEXT PRIMARY KEY,                            -- normalizado (solo dígitos/X)
  payload JSONB NOT NULL,
  source TEXT NOT NULL,                             -- 'openlibrary' | 'googlebooks' | 'none'
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS tenant (patrón 047; el GUC lo setea withTenant) ──────────────────────
ALTER TABLE biblio_sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON biblio_sites;
CREATE POLICY tenant_isolation ON biblio_sites
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE biblio_titles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON biblio_titles;
CREATE POLICY tenant_isolation ON biblio_titles
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE biblio_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON biblio_items;
CREATE POLICY tenant_isolation ON biblio_items
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- ── Grants explícitos a app_v2 (cinturón además de los defaults de la 048) ───
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_v2') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON biblio_sites, biblio_titles, biblio_items, biblio_isbn_cache TO app_v2;
  END IF;
END
$$;
