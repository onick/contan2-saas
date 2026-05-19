-- ============================================================================
-- 009_activity_category · sub-categoría opcional para actividades
-- ============================================================================
-- Permite agrupar actividades en ciclos o temas (ej: "cine dominicano",
-- "5to ciclo", "patrimonio") sin cambiar el `type` base. Texto libre normalizado
-- a minúsculas; el frontend ofrece autocomplete desde categorías existentes.
--
-- Operación 100% aditiva, sin defaults retroactivos. Las filas viejas
-- quedan con category=NULL (sin ciclo).
-- ============================================================================

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS category TEXT NULL;

-- Índice parcial: solo indexa filas que tienen categoría.
-- Acelera segments por categoría (donde category IS NOT NULL).
CREATE INDEX IF NOT EXISTS idx_activities_category
  ON activities (organization_id, category)
  WHERE category IS NOT NULL;
