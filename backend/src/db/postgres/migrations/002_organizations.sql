-- =============================================================================
-- 002_organizations · multi-tenant foundation
-- Tablas de organizations, miembros admin, sesiones, invitaciones,
-- recovery, verification, billing placeholder, audit log.
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   CITEXT NOT NULL,
  name                   TEXT NOT NULL,
  legal_name             TEXT,
  country                TEXT,
  timezone               TEXT NOT NULL DEFAULT 'America/Santo_Domingo',
  locale                 TEXT NOT NULL DEFAULT 'es',
  logo_url               TEXT,
  primary_color          TEXT NOT NULL DEFAULT '#1a237e',
  secondary_color        TEXT NOT NULL DEFAULT '#ff6f00',
  code_prefix            TEXT NOT NULL DEFAULT 'MEM',
  email_from_name        TEXT,
  email_from_addr        TEXT,
  email_reply_to         TEXT,
  staff_pin_hash         TEXT,
  custom_domain          CITEXT,
  custom_domain_verified_at TIMESTAMPTZ,
  status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'suspended', 'trial_ended', 'deleted')),
  trial_ends_at          TIMESTAMPTZ,
  plan                   TEXT NOT NULL DEFAULT 'free'
                           CHECK (plan IN ('free', 'pro', 'enterprise')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ
);

-- Slug único entre orgs vivas
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_active_unique
  ON organizations (slug) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_custom_domain_unique
  ON organizations (custom_domain)
  WHERE custom_domain IS NOT NULL AND deleted_at IS NULL;

-- Slugs muertos: nunca reusar (tabla histórica para evitar hijacking de subdominios)
CREATE TABLE IF NOT EXISTS dead_slugs (
  slug         CITEXT PRIMARY KEY,
  retired_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason       TEXT
);

-- Miembros admin (owner/admin/staff) que administran una org
CREATE TABLE IF NOT EXISTS org_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email               CITEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  role                TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
  email_verified_at   TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  totp_secret         TEXT,
  totp_enabled_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS org_members_email_idx ON org_members (email);

-- Invitaciones pendientes a una org
CREATE TABLE IF NOT EXISTS org_invitations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email             CITEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  token_hash        TEXT NOT NULL UNIQUE,
  invited_by        UUID REFERENCES org_members(id) ON DELETE SET NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  accepted_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_invitations_org_email_idx
  ON org_invitations (organization_id, email)
  WHERE accepted_at IS NULL;

-- Sesiones de admin (DB-backed, opaque cookie)
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  member_id       UUID NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  ip              INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_member_idx ON sessions (member_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- Sesiones de staff (kiosko/scanner), scoped por org
CREATE TABLE IF NOT EXISTS staff_sessions (
  id              TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ip              INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS staff_sessions_org_idx ON staff_sessions (organization_id);
CREATE INDEX IF NOT EXISTS staff_sessions_expires_idx ON staff_sessions (expires_at);

-- Tokens de recovery
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tokens de verificación de email (signup)
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Suscripción de billing (placeholder; Stripe se conecta post-MVP)
CREATE TABLE IF NOT EXISTS subscriptions (
  organization_id        UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan                   TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'enterprise')),
  status                 TEXT NOT NULL
                           CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  current_period_end     TIMESTAMPTZ,
  trial_end              TIMESTAMPTZ,
  canceled_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Snapshot mensual de uso para enforcement de límites por plan
CREATE TABLE IF NOT EXISTS usage_counters (
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period            DATE NOT NULL,
  emails_sent       INTEGER NOT NULL DEFAULT 0,
  users_created     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, period)
);

-- Audit log (recomendado en SaaS B2B)
CREATE TABLE IF NOT EXISTS audit_log (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   UUID NOT NULL,
  actor_member_id   UUID,
  action            TEXT NOT NULL,
  entity_type       TEXT,
  entity_id         TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip                INET,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_org_created_idx
  ON audit_log (organization_id, created_at DESC);
