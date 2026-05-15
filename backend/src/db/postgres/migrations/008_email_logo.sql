-- =============================================================================
-- 008_email_logo · logo separado para emails
-- Muchos logos diseñados para web (e.g. blanco sobre transparente para
-- sidebars con color de marca) no se ven bien en clientes de email
-- (que mayoritariamente tienen fondo claro). email_logo_url permite a
-- la org subir una variante optimizada para correo. Si no se setea,
-- emailBranding.js cae a logo_url.
-- =============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS email_logo_url TEXT;
