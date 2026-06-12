-- =============================================================================
-- 029_protocol_profiles · módulo Protocolo (ADITIVA · v1-compatible)
--
-- Designación MANUAL de invitados especiales del centro (autoridades,
-- diplomáticos, prensa, patrocinadores, directivos, artistas). Distinta del
-- segmento "VIP" automático (≥10 visitas): protocolo es institucional y la
-- gestiona owner/admin. La persona sigue siendo un `user` normal (mismo
-- código/QR/historial); este perfil le agrega categoría, tratamiento
-- honorífico y cargo para la invitación formal y el banner de puerta.
--
-- v1 ignora la tabla por completo. 100% aditiva e idempotente.
-- =============================================================================

-- OJO tipos heredados de v1: users.id y activities.id son TEXT;
-- organizations.id y staff_members.id son UUID.
CREATE TABLE IF NOT EXISTS protocol_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN
    ('autoridad', 'diplomatico', 'prensa', 'patrocinador', 'directivo', 'artista', 'otro')),
  honorific TEXT NULL,
  org_title TEXT NULL,
  notes TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Listados del directorio: por org, activos primero, filtrables por categoría.
CREATE INDEX IF NOT EXISTS protocol_profiles_org_idx
  ON protocol_profiles (organization_id, active, category);
