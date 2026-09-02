-- 051_biblio_title_extras.sql · Módulo Biblioteca F1.1: campos bibliográficos
-- adicionales del formulario "Nuevo título" (modelo aprobado por el usuario):
-- información física + adquisición. Todos opcionales; idempotente.
-- SOLO STAGING por ahora (la Biblioteca no toca producción sin OK explícito).

ALTER TABLE biblio_titles
  ADD COLUMN IF NOT EXISTS pages integer,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS physical_format text,
  ADD COLUMN IF NOT EXISTS binding text,
  ADD COLUMN IF NOT EXISTS dimensions text,
  ADD COLUMN IF NOT EXISTS audience text,
  ADD COLUMN IF NOT EXISTS acquisition_source text,
  ADD COLUMN IF NOT EXISTS acquired_on date;
