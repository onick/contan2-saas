-- Migración: signup_verifications
-- Tabla para almacenar códigos de verificación de email durante el auto-registro.
-- El registro no crea la organización hasta que el código se verifica.

CREATE TABLE IF NOT EXISTS signup_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  slug TEXT NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para buscar verificaciones pendientes por email
CREATE INDEX IF NOT EXISTS idx_signup_verif_email ON signup_verifications(email, code);

-- Índice para limpiar registros expirados (mantenimiento futuro)
CREATE INDEX IF NOT EXISTS idx_signup_verif_expires ON signup_verifications(expires_at)
  WHERE verified_at IS NULL;
