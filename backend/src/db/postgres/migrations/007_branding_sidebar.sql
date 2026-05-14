-- =============================================================================
-- 007_branding_sidebar · sidebar style preset por organización
-- 'brand'  = gradiente del color primario (default)
-- 'dark'   = neutros oscuros
-- 'light'  = panel claro sobre superficie blanca
-- =============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS sidebar_style TEXT NOT NULL DEFAULT 'brand'
    CHECK (sidebar_style IN ('brand', 'dark', 'light'));
