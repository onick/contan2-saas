-- 024 · activities.end_date (ADITIVA · nullable)
--
-- Fecha/hora de cierre OPCIONAL de una actividad. Hasta ahora solo existía
-- `date` (inicio). Nullable: las actividades existentes quedan con cierre vacío
-- y no se obliga a ningún valor. La validación end >= inicio va en la capa de
-- dominio (validateActivityCreate/Update). No afecta la visibilidad pública
-- (sigue por status 'activa' + cupo). Idempotente (IF NOT EXISTS).

ALTER TABLE activities ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
