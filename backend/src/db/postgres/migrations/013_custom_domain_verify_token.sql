-- ============================================================================
-- 013_custom_domain_verify_token · token para verificar propiedad de dominio
-- ============================================================================
-- Cuando un tenant solicita usar su dominio propio (ej:
-- "eventos.centroculturalbanreservas.com"), generamos un token random.
-- El tenant debe crear un DNS TXT record:
--   _contan2-verify.<dominio>  TXT  "contan2-domain-verify=<token>"
-- Una vez creado, el tenant pulsa "Verificar" y el backend hace lookup TXT.
-- Si encuentra el token correcto -> custom_domain_verified_at = NOW().
--
-- 100% aditiva. NULL en filas existentes (que no usan dominio propio).
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS custom_domain_verify_token TEXT;
