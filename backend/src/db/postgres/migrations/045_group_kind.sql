-- Migración: tipo de grupo customizable en salas permanentes. Hasta ahora el
-- registro de grupo asumía "colegio"; el CCB también recibe grupos comunitarios
-- (jóvenes de un sector), empresas, etc. NULL = colegio (histórico, compatible).
-- Aditiva e idempotente; v1 la ignora.

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS group_kind TEXT;      -- tipo de grupo (NULL = colegio)
ALTER TABLE space_bookings ADD COLUMN IF NOT EXISTS group_kind TEXT;  -- tipo de grupo de la reserva (NULL = colegio)
