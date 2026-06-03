-- 023 · attendance.companions_children (ADITIVA · v1-compatible)
--
-- Niños acompañantes asociados al ADULTO responsable de un check-in. El cupo
-- ocupado por el registro es partySize = 1 + companions_children. Solo niños van
-- como acompañantes; cada adulto se registra con identidad propia (su user/QR).
--
-- Esta columna es PURAMENTE ADITIVA: NOT NULL con DEFAULT 0, así las filas
-- existentes quedan en 0 y el runtime de v1 (que la ignora) no cambia. No se
-- agrega ni se altera ningún UNIQUE: el unique tenant-scoped de check-in ya
-- existe (005_tenant_constraints · attendance_org_user_activity_unique). El
-- escritor v2 (POST /api/v2/public/checkin) es el primer consumidor.
--
-- Idempotente: IF NOT EXISTS + CHECK inline → re-correr no rompe.

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS companions_children SMALLINT NOT NULL DEFAULT 0
  CHECK (companions_children >= 0);
