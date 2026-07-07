-- Migración: corrige los tipos de space_bookings. La 041 declaró activity_id y
-- attendance_id como UUID, pero activities.id y attendance.id son TEXT en v1 →
-- los JOIN fallaban ("operator does not exist: text = uuid"). La tabla está
-- vacía (nada la escribía todavía), así que el ALTER es instantáneo y seguro.
-- Idempotente: alterar una columna que ya es text es un no-op.

ALTER TABLE space_bookings ALTER COLUMN activity_id TYPE text USING activity_id::text;
ALTER TABLE space_bookings ALTER COLUMN attendance_id TYPE text USING attendance_id::text;
