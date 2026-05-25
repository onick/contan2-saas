-- ============================================================================
-- 020_staff_member_role · agrega rol al staff (owner / admin / operator)
-- ============================================================================
-- Sprint 3 introduce diferenciación de permisos dentro de un tenant.
-- Tres roles iniciales:
--   owner    → todos los permisos, único que puede transferir ownership
--   admin    → gestiona staff, branding, dominio; no puede borrar la org
--   operator → operación cotidiana (check-in, registrar usuarios, ver
--              actividades); no toca configuración ni staff
--
-- Backfill: el staff que existía antes de este sprint era de hecho el
-- owner del tenant (creado por seed-tenant-owner.mjs como primer y único
-- miembro). Lo subimos a owner.
-- ============================================================================

ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'operator'
    CHECK (role IN ('owner','admin','operator'));

-- Backfill defensivo. Aplica solo a quienes están en default 'operator'
-- al momento de la migración; si en el futuro se re-aplica esto no roba
-- el rol a nadie ya cambiado.
UPDATE staff_members
   SET role = 'owner'
 WHERE role = 'operator'
   AND deleted_at IS NULL;

-- Index para filtros del admin "lista por org y por rol".
CREATE INDEX IF NOT EXISTS staff_members_org_role_idx
  ON staff_members (organization_id, role)
  WHERE deleted_at IS NULL;
