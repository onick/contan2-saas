-- 025 · checkin_idempotency (ADITIVA · idempotente) · dedup del "+1 sin
-- credencial" por Idempotency-Key del cliente (anti doble-click/reintento). PK
-- (organization_id, endpoint, idempotency_key). `attendance_id` = resultado a
-- devolver en un replay. `expires_at` (TTL ~24h): una key EXPIRADA puede
-- reclamarse de nuevo; el índice por expires_at habilita un cleanup por lotes.
-- No afecta v1 (tabla nueva; v1 la ignora). IF NOT EXISTS → idempotente.
CREATE TABLE IF NOT EXISTS checkin_idempotency (
  organization_id  TEXT NOT NULL,
  endpoint         TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  attendance_id    TEXT NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, endpoint, idempotency_key)
);
CREATE INDEX IF NOT EXISTS checkin_idempotency_expires_idx ON checkin_idempotency (expires_at);
