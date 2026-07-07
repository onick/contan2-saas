-- Migración: PROGRAMAS / CICLOS por tenant. Vocabulario controlado de la
-- "Programa" (ej. Cine Dominicano, Cine Clásico, Temporada de Teatro) que hoy
-- vive como texto libre en activities.category. Esta tabla es la AUTORIDAD del
-- vocabulario + la config de edición anual (un ciclo que incrementa cada año:
-- 2026 = 5ta edición). La edición NO se almacena por actividad: se deriva del
-- año + el ancla del programa. activities.category sigue siendo el string
-- canónico (no FK) para no romper segmentos/reportes/kiosko. Todo idempotente.

CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,                       -- nombre canónico ("Cine Dominicano")
  slug TEXT NOT NULL,                        -- normalizado (acento/case) = slug de category
  is_cyclical BOOLEAN NOT NULL DEFAULT false,
  edition_anchor_year INTEGER,              -- año de referencia (ej. 2026)
  edition_anchor_number INTEGER,            -- edición en ese año (ej. 5)
  edition_noun TEXT NOT NULL DEFAULT 'ciclo', -- "ciclo" | "temporada" | "edición"
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Un slug por tenant (no dos programas con el mismo nombre canónico).
CREATE UNIQUE INDEX IF NOT EXISTS idx_programs_org_slug ON programs(organization_id, slug);
CREATE INDEX IF NOT EXISTS idx_programs_org_active ON programs(organization_id, active);
