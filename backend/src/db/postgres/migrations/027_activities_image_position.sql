-- =============================================================================
-- 027_activities_image_position · encuadre vertical de la portada (ADITIVA ·
-- v1-compatible)
--
-- Agrega `activities.image_pos_y` (0–100, NULL = centro/50): porcentaje vertical
-- del encuadre con que se muestra la portada (CSS object-position "50% NN%").
-- El staff sube una foto y ajusta qué franja se ve en las tarjetas/detalle.
-- v1 la ignora por completo. Validación de rango en la API (zod 0..100); sin
-- CHECK en DB para mantener la migración trivialmente idempotente.
-- =============================================================================

ALTER TABLE activities ADD COLUMN IF NOT EXISTS image_pos_y SMALLINT NULL;
