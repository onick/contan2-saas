-- =============================================================================
-- 030_invitations_protocol · invitaciones de protocolo (ADITIVA · v1-compatible)
--
-- `kind`: separa las invitaciones de AUDIENCIA (RSVP masivo por segmentos) de
-- las de PROTOCOLO (invitados especiales, designados en protocol_profiles).
-- `plus_ones`: acompañantes AUTORIZADOS por invitación (decisión del usuario
-- 2026-06-11: +N por invitado, lo fija el admin al invitar); al confirmar, el
-- cupo descuenta 1 + plus_ones (mismo espíritu de companions del kiosko).
--
-- v1 inserta en invitations con columnas EXPLÍCITAS (PostgresInvitationRepository
-- .create) → los DEFAULTs hacen estas columnas invisibles para v1. CHECKs
-- inline (solo aplican al crear la columna → idempotente con IF NOT EXISTS).
-- =============================================================================

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'audience'
    CHECK (kind IN ('audience', 'protocol'));

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS plus_ones INTEGER NOT NULL DEFAULT 0
    CHECK (plus_ones >= 0 AND plus_ones <= 10);
