-- =============================================================================
-- 035_staff_role_consulta · quinto rol de staff: 'consulta' (ADITIVA)
--
-- Rol de SOLO LECTURA de la organización: ve la información (dashboard,
-- actividades, reportes, visitantes) pero NO gestiona nada. Los permisos los
-- arbitra api-v2 por allowlist de roles: 'consulta' no está en ninguna
-- allowlist de escritura/gestión → queda excluido de todo write por defecto,
-- y los GET con requireTenantStaff lo dejan leer. v1 también usa allowlists
-- (requireRole) → una cuenta 'consulta' en v1 recibe 403 en todo (sin crash).
--
-- Amplía el CHECK de staff_members.role y de staff_invitations.role (mismo
-- patrón que 031_staff_role_protocolo). Idempotente: DROP IF EXISTS + ADD.
-- =============================================================================

ALTER TABLE staff_members DROP CONSTRAINT IF EXISTS staff_members_role_check;
ALTER TABLE staff_members ADD CONSTRAINT staff_members_role_check
  CHECK (role IN ('owner', 'admin', 'operator', 'protocolo', 'consulta'));

ALTER TABLE staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_role_check;
ALTER TABLE staff_invitations ADD CONSTRAINT staff_invitations_role_check
  CHECK (role IN ('owner', 'admin', 'operator', 'protocolo', 'consulta'));
