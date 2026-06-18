-- 034 · activities.audience (ADITIVA · v1-compatible)
--
-- Tipo de público de la actividad, que define cómo se clasifican los
-- acompañantes de cada check-in:
--   · 'adultos'  → los acompañantes cuentan como ADULTOS (companions_adults).
--   · 'infantil' → los acompañantes cuentan como NIÑOS  (companions_children).
--
-- Así una sola decisión al crear la actividad gobierna el rótulo en el kiosko,
-- la puerta y el resumen, sin que nadie clasifique en cada registro.
--
-- Aditiva: NOT NULL con DEFAULT 'adultos' (el caso más común en el CCB) → las
-- filas existentes quedan en 'adultos' y v1 (que la ignora) no cambia.
--
-- Idempotente: IF NOT EXISTS + CHECK inline → re-correr no rompe.

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'adultos'
  CHECK (audience IN ('adultos', 'infantil'));
