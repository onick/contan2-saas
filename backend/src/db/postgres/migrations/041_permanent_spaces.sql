-- Migración: espacios PERMANENTES (salas que reciben visitantes de continuo,
-- no eventos con fecha única) + datos de grupo escolar en asistencia + agenda de
-- reservas. Todo idempotente.

-- Actividad permanente: exenta de auto-cierre y del filtro de cupo del kiosko.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT false;
-- Horario de apertura (JSON) ej. {"semana":[9,22],"finde":[10,18]}.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS open_schedule JSONB;
-- Ocupación viva (contador informativo, ej. sala VR N/8). No bloquea.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS occupancy INTEGER NOT NULL DEFAULT 0;

-- Datos de grupo escolar en la asistencia (profesor = visitante; alumnos = cantidad).
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS group_label TEXT;   -- colegio
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS group_level TEXT;   -- nivel/grado
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS group_contact TEXT; -- profesor responsable

-- Agenda de reservas de un espacio (VR): el depto agenda visitas de colegios.
CREATE TABLE IF NOT EXISTS space_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  activity_id UUID NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  colegio TEXT NOT NULL,
  level TEXT,
  contact_name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  student_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','confirmed','attended','no_show','cancelled')),
  notes TEXT,
  attendance_id UUID,          -- se setea al hacer check-in de la reserva
  confirmed_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,     -- email al profesor
  created_by_staff_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_space_bookings_activity ON space_bookings(activity_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_space_bookings_org_day ON space_bookings(organization_id, scheduled_at);
