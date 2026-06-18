-- 033 · attendance.companions_adults (ADITIVA · v1-compatible)
--
-- Acompañantes ADULTOS asociados a un check-in (gala, evento de público adulto,
-- acompañantes autorizados de protocolo). Complementa companions_children (023):
-- los niños siguen yendo en companions_children (flujo del kiosko "¿vienes con
-- niños?"); los adultos van aquí (consola de puerta / lista de invitados).
-- El cupo ocupado por el registro es partySize = 1 + companions_children +
-- companions_adults.
--
-- Puramente ADITIVA: NOT NULL con DEFAULT 0 → filas existentes quedan en 0 y el
-- runtime de v1 (que la ignora) no cambia. No toca ningún UNIQUE.
--
-- Idempotente: IF NOT EXISTS + CHECK inline → re-correr no rompe.

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS companions_adults SMALLINT NOT NULL DEFAULT 0
  CHECK (companions_adults >= 0);
