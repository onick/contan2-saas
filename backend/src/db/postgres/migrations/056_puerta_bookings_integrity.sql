-- 056_puerta_bookings_integrity.sql · Agenda de la Sala VR (PUE-A03, PR-P3).
-- Integridad de space_bookings:
--   (a) limpia reservas "huérfanas" (attendance_id apunta a una asistencia que ya
--       no existe) → attendance_id NULL y status 'confirmed'. REQUIERE OK del dueño
--       antes de correrla en un entorno real: ver docs/runbooks/puerta-mig-056.md
--       (SELECT previo que cuenta las filas afectadas).
--   (b) FK space_bookings.attendance_id → attendance(id) ON DELETE SET NULL.
--   (c) columnas email_error, cancelled_at, no_show_at, rescheduled_from.
--   (d) trigger: al borrar una asistencia, su reserva 'attended' vuelve a 'confirmed'
--       (cubre Deshacer de Puerta, DELETE /attendance/:id y cualquier otra vía).
--   (e) RLS tenant_isolation en space_bookings (patrón 047/050/052-055).
--   (f) índice (organization_id, activity_id, scheduled_at) para agenda por sala.
-- Idempotente, una transacción. Rollback: ver el runbook.

BEGIN;

-- (a) huérfanos
UPDATE space_bookings
   SET attendance_id = NULL,
       -- Solo una reserva marcada 'attended' vuelve a 'confirmed'; una cancelada sigue cancelada.
       status = CASE WHEN status = 'attended' THEN 'confirmed' ELSE status END,
       updated_at = now()
 WHERE attendance_id IS NOT NULL
   AND attendance_id NOT IN (SELECT id FROM attendance);

-- (c) columnas
ALTER TABLE space_bookings ADD COLUMN IF NOT EXISTS email_error TEXT;
ALTER TABLE space_bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE space_bookings ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ;
ALTER TABLE space_bookings ADD COLUMN IF NOT EXISTS rescheduled_from TIMESTAMPTZ;

-- (b) FK
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'space_bookings_attendance_fk') THEN
    ALTER TABLE space_bookings
      ADD CONSTRAINT space_bookings_attendance_fk
      FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- (d) al borrar la asistencia, la reserva 'attended' vuelve a 'confirmed'. BEFORE
-- DELETE corre antes de la acción SET NULL de la FK. SECURITY DEFINER: debe
-- funcionar aunque quien borra no tenga el GUC del tenant (RLS).
CREATE OR REPLACE FUNCTION space_bookings_on_attendance_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE space_bookings
     SET status = 'confirmed', updated_at = now()
   WHERE attendance_id = OLD.id AND status = 'attended';
  RETURN OLD;
END
$$;
DROP TRIGGER IF EXISTS trg_space_bookings_attendance_delete ON attendance;
CREATE TRIGGER trg_space_bookings_attendance_delete
  BEFORE DELETE ON attendance
  FOR EACH ROW EXECUTE FUNCTION space_bookings_on_attendance_delete();

-- (e) RLS
ALTER TABLE space_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON space_bookings;
CREATE POLICY tenant_isolation ON space_bookings
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- (f) índice
CREATE INDEX IF NOT EXISTS idx_space_bookings_org_sala_day
  ON space_bookings (organization_id, activity_id, scheduled_at);

INSERT INTO _migrations (id) VALUES ('056_puerta_bookings_integrity') ON CONFLICT DO NOTHING;

COMMIT;
