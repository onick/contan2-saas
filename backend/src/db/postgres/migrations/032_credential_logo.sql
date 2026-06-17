-- ============================================================
-- 032 · Logo propio de la tarjeta de miembro (credencial)
-- ------------------------------------------------------------
-- Logo SEPARADO del principal (logo_url). El principal sirve el
-- menú lateral, el encabezado, el kiosko y los reportes; este
-- sirve EXCLUSIVAMENTE la credencial / tarjeta de miembro que
-- recibe cada visitante. Aditivo y nullable: si una org no lo
-- define, la credencial cae al logo principal (logo_url).
-- ============================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS credential_logo_url TEXT;
