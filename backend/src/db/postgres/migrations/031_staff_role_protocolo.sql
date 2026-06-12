-- =============================================================================
-- 031_staff_role_protocolo · cuarto rol de staff: 'protocolo' (ADITIVA)
--
-- El departamento de Protocolo del centro recibe su propia cuenta que SOLO
-- usa el módulo Protocolo (directorio + invitar a actividades). Los permisos
-- reales los arbitra api-v2 por allowlist de roles; v1 también usa allowlists
-- (requireRole) → una cuenta 'protocolo' en v1 recibe 403 en todo (sin crash).
--
-- Amplía el CHECK de staff_members.role y de staff_invitations.role (nombres
-- de constraint verificados contra el schema real: *_role_check).
-- Idempotente: DROP IF EXISTS + ADD.
-- =============================================================================

ALTER TABLE staff_members DROP CONSTRAINT IF EXISTS staff_members_role_check;
ALTER TABLE staff_members ADD CONSTRAINT staff_members_role_check
  CHECK (role IN ('owner', 'admin', 'operator', 'protocolo'));

ALTER TABLE staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_role_check;
ALTER TABLE staff_invitations ADD CONSTRAINT staff_invitations_role_check
  CHECK (role IN ('owner', 'admin', 'operator', 'protocolo'));
