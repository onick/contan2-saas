-- Migración: permitir MÚLTIPLES entradas del mismo visitante a una sala
-- PERMANENTE (cada entrada cuenta). El índice único (org,user,activity) era para
-- la idempotencia del check-in de actividades con fecha; NO debe aplicar a salas
-- permanentes (donde la misma persona re-entra y cada entrada suma). Se
-- denormaliza is_permanent en attendance y se recrea el índice como PARCIAL
-- (solo actividades no permanentes). Todo idempotente.

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT false;

-- Marca la asistencia existente que corresponde a salas permanentes.
UPDATE attendance a SET is_permanent = true
  FROM activities act
  WHERE act.id = a.activity_id AND act.is_permanent = true AND a.is_permanent = false;

-- Índice único PARCIAL: solo actividades NO permanentes conservan la idempotencia
-- (org,user,activity). Las permanentes quedan fuera → re-entradas permitidas.
DROP INDEX IF EXISTS attendance_org_user_activity_unique;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_org_user_activity_unique
  ON attendance (organization_id, user_id, activity_id)
  WHERE is_permanent = false;
