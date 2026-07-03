-- Migración: notas internas del tenant (solo visibles para el super-admin de
-- plataforma en el panel de control). No se exponen al admin del tenant.
-- Idempotente.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS internal_notes TEXT;
