-- 057_sala_kind.sql · Tipo de sala explícito (PUE-A09, PR-P6).
-- Hasta ahora el "tipo" de una sala permanente se adivinaba por la capacidad
-- (capacity <= 200 => VR con aforo; si no, exposición "ilimitada" con 100000).
-- Columnas nuevas en activities (solo tienen sentido para is_permanent = true):
--   sala_kind  TEXT NULL  · 'exposicion' | 'vr' | 'otra'   (NULL en actividades con fecha)
--   has_agenda BOOLEAN    · la sala tiene agenda de reservas de grupos (hoy: solo la VR)
--   aforo      INTEGER    · aforo REAL de la sala (NULL = sin límite). Es independiente de
--                           activities.capacity, que en los eventos sigue siendo el cupo
--                           (CHECK enrolled_count <= capacity) y en las salas queda como
--                           valor técnico (100000) que ya NO se interpreta como tipo.
-- Backfill (solo is_permanent = true):
--   capacity <= 200 -> sala_kind 'vr', has_agenda true, aforo = capacity
--   resto           -> sala_kind 'exposicion', has_agenda false, aforo NULL
-- Idempotente (el backfill solo toca filas con sala_kind NULL), una transacción.
-- Rollback: docs/runbooks/puerta-mig-057.md

BEGIN;

ALTER TABLE activities ADD COLUMN IF NOT EXISTS sala_kind TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS has_agenda BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS aforo INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_sala_kind_check') THEN
    ALTER TABLE activities
      ADD CONSTRAINT activities_sala_kind_check
      CHECK (sala_kind IS NULL OR sala_kind IN ('exposicion', 'vr', 'otra'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_aforo_check') THEN
    ALTER TABLE activities
      ADD CONSTRAINT activities_aforo_check
      CHECK (aforo IS NULL OR aforo > 0);
  END IF;
END
$$;

UPDATE activities
   SET sala_kind = 'vr', has_agenda = true, aforo = capacity
 WHERE is_permanent = true AND sala_kind IS NULL AND capacity <= 200;

UPDATE activities
   SET sala_kind = 'exposicion', has_agenda = false, aforo = NULL
 WHERE is_permanent = true AND sala_kind IS NULL;

INSERT INTO _migrations (id) VALUES ('057_sala_kind') ON CONFLICT DO NOTHING;

COMMIT;
