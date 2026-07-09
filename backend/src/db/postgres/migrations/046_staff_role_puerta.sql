-- =============================================================================
-- 046_staff_role_puerta · sexto rol de staff: 'puerta' (ADITIVA)
--
-- Rol del DEPARTAMENTO DE PUERTA (salas permanentes: Ada Balcácer, Sala VR).
-- Confinado a su superficie de trabajo; los permisos los arbitra api-v2 por
-- allowlist de roles (requireTenantStaff + requireRole):
--   · Puerta (registrar entrada, agenda VR, export de sus salas) → ESCRIBE
--     (endpoints /puerta/* usan requireTenantStaff = cualquier staff).
--   · Registros (historial) y Reportes → LEE/DESCARGA (agregado a CAN_READ_AUDIT
--     y CAN_GENERATE_REPORTS).
--   · Protocolo → SOLO LECTURA (agregado a PROTOCOL_READ_ROLES; NO a la
--     allowlist de escritura de protocolo).
--   · Mi cuenta.
-- Queda FUERA de toda otra allowlist de escritura (usuarios, actividades,
-- identidad, equipo, segmentos) → 403 ahí. El layout del admin lo confina por
-- UX a /app/{puerta,registros,protocolo,reportes,cuenta}.
--
-- Amplía el CHECK de staff_members.role y de staff_invitations.role (mismo
-- patrón que 031_staff_role_protocolo y 035_staff_role_consulta). Idempotente:
-- DROP IF EXISTS + ADD.
-- =============================================================================

ALTER TABLE staff_members DROP CONSTRAINT IF EXISTS staff_members_role_check;
ALTER TABLE staff_members ADD CONSTRAINT staff_members_role_check
  CHECK (role IN ('owner', 'admin', 'operator', 'protocolo', 'consulta', 'puerta'));

ALTER TABLE staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_role_check;
ALTER TABLE staff_invitations ADD CONSTRAINT staff_invitations_role_check
  CHECK (role IN ('owner', 'admin', 'operator', 'protocolo', 'consulta', 'puerta'));
