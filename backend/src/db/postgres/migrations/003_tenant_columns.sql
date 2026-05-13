-- =============================================================================
-- 003_tenant_columns · agrega organization_id (NULLABLE) a tablas existentes
-- En 005 se hace NOT NULL después del backfill.
-- =============================================================================

ALTER TABLE users        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE activities   ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE attendance   ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
