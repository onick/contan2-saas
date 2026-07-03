-- Migración: logo_scale (tamaño del logo horizontal, ajustable por el tenant)
-- El tenant puede agrandar/achicar su logo del sidebar/encabezado desde Identidad.
-- Se guarda como porcentaje entero (100 = tamaño base). Rango de la UI: 50–200.
-- INTEGER (no NUMERIC) para que pg lo devuelva como número, no string.
-- Idempotente.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_scale INTEGER NOT NULL DEFAULT 100;
