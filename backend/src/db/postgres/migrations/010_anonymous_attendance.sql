-- ============================================================================
-- 010_anonymous_attendance · check-in sin credencial
-- ============================================================================
-- Permite registrar asistencia "anónima" cuando un visitante pasa por la
-- puerta sin credencial (típicamente: grupo entrando junto en pico de
-- demanda, VIP/prensa sin reserva previa). El registro queda con
-- user_id=NULL, user_code=NULL, anonymous=TRUE. La actividad incrementa
-- enrolled_count igual, así el cupo refleja la realidad.
--
-- Operación 100% aditiva: las filas existentes ya tienen user_id NOT NULL
-- (siempre fueron concretas), y permanecen así. Las nuevas filas
-- anónimas pueden tener NULL.
-- ============================================================================

ALTER TABLE attendance ALTER COLUMN user_id   DROP NOT NULL;
ALTER TABLE attendance ALTER COLUMN user_code DROP NOT NULL;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS anonymous BOOLEAN NOT NULL DEFAULT FALSE;

-- Invariante: anonymous → no hay user_id, y viceversa. Postgres rechaza
-- rows donde se setea anonymous=TRUE con user_id set, o anonymous=FALSE
-- con user_id NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_anonymous_consistent'
  ) THEN
    ALTER TABLE attendance
      ADD CONSTRAINT attendance_anonymous_consistent
      CHECK (
        (anonymous = TRUE  AND user_id IS NULL AND user_code IS NULL) OR
        (anonymous = FALSE AND user_id IS NOT NULL)
      );
  END IF;
END $$;

-- Index para queries de "cuantos anonimos por actividad"
CREATE INDEX IF NOT EXISTS idx_attendance_anonymous_activity
  ON attendance (organization_id, activity_id)
  WHERE anonymous = TRUE;
