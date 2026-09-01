-- =============================================================================
-- 049_staff_role_biblioteca · séptimo rol de staff: 'biblioteca' (ADITIVA)
--
-- Rol del equipo de la BIBLIOTECA (módulo Biblioteca, plan
-- docs/plan-modulo-biblioteca.md). Confinado a su superficie; los permisos los
-- arbitra api-v2 por allowlist de roles:
--   · Biblioteca (catálogo, ejemplares, circulación) → ESCRIBE.
--   · Mi cuenta.
-- Queda FUERA de toda otra allowlist → 403. El layout del admin lo confina por
-- UX a /app/{biblioteca,cuenta}.
--
-- Amplía el CHECK de staff_members.role y staff_invitations.role (mismo patrón
-- que 046_staff_role_puerta). Idempotente: DROP IF EXISTS + ADD.
-- =============================================================================

ALTER TABLE staff_members DROP CONSTRAINT IF EXISTS staff_members_role_check;
ALTER TABLE staff_members ADD CONSTRAINT staff_members_role_check
  CHECK (role IN ('owner', 'admin', 'operator', 'protocolo', 'consulta', 'puerta', 'biblioteca'));

ALTER TABLE staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_role_check;
ALTER TABLE staff_invitations ADD CONSTRAINT staff_invitations_role_check
  CHECK (role IN ('owner', 'admin', 'operator', 'protocolo', 'consulta', 'puerta', 'biblioteca'));
