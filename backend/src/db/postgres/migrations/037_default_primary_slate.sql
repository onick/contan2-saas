-- Migración: default de primary_color → slate neutro
-- Los tenants nuevos nacían con navy #1a237e (legacy CCB), un primario
-- demasiado fuerte para una marca genérica white-label. El nuevo default es
-- un slate neutro (#334155) que no compite con el acento y que el tenant
-- reemplaza por el suyo desde Identidad. El acento (#ff6f00) se mantiene.
-- Idempotente: SET DEFAULT se puede reaplicar sin efecto.

ALTER TABLE organizations ALTER COLUMN primary_color SET DEFAULT '#334155';
