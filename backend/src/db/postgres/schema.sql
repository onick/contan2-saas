-- ============================================================================
-- CCB / contan2-saas — schema PostgreSQL
-- Coincide 1:1 con el modelo de los repositorios en memoria.
-- Mantener nombres en snake_case en DB, los repos hacen el mapping a camelCase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  visit_count   INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);

-- ============================================================================
CREATE TABLE IF NOT EXISTS activities (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  location        TEXT NOT NULL,
  date            TIMESTAMPTZ NOT NULL,
  capacity        INTEGER NOT NULL CHECK (capacity >= 1),
  description     TEXT NOT NULL DEFAULT '',
  image_url       TEXT,
  enrolled_count  INTEGER NOT NULL DEFAULT 0 CHECK (enrolled_count >= 0),
  status          TEXT NOT NULL DEFAULT 'activa'
                    CHECK (status IN ('activa', 'finalizada', 'cancelada')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (enrolled_count <= capacity)
);

CREATE INDEX IF NOT EXISTS activities_status_idx ON activities (status);
CREATE INDEX IF NOT EXISTS activities_date_idx ON activities (date);
CREATE INDEX IF NOT EXISTS activities_type_idx ON activities (type);

-- ============================================================================
CREATE TABLE IF NOT EXISTS attendance (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_code      TEXT NOT NULL,
  activity_id    TEXT NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  activity_name  TEXT NOT NULL,
  registered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, activity_id)
);

CREATE INDEX IF NOT EXISTS attendance_user_idx ON attendance (user_id);
CREATE INDEX IF NOT EXISTS attendance_activity_idx ON attendance (activity_id);
CREATE INDEX IF NOT EXISTS attendance_registered_at_idx ON attendance (registered_at DESC);
