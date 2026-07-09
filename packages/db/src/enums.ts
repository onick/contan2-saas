// packages/db/src/enums.ts · uniones de string literals que reflejan los
// CHECK constraints de las migraciones v1. Single source para v2; cuando
// packages/contracts crezca, puede re-exportarlos.

export type OrgStatus = 'active' | 'suspended' | 'trial_ended' | 'deleted';
export type OrgPlan = 'free' | 'pro' | 'enterprise';
export type SidebarStyle = 'brand' | 'dark' | 'light';

// staff_members.status y platform_admins.status comparten este conjunto.
export type AccountStatus = 'active' | 'suspended' | 'deleted';

// 'consulta' (migración 035): rol de SOLO LECTURA. Ve la información pero no
// gestiona (queda fuera de toda allowlist de escritura). v1 le da 403 en todo.
// 'puerta' (migración 046): rol del DEPARTAMENTO DE PUERTA (salas permanentes).
// Confinado a su módulo (Puerta, escribe) + Registros/Reportes (lee/descarga) +
// Protocolo (lee) + Mi cuenta. Fuera de toda allowlist de escritura del resto.
export type StaffRole = 'owner' | 'admin' | 'operator' | 'protocolo' | 'consulta' | 'puerta';

// activities.status CHECK (migración 001_initial.sql).
export type ActivityStatus = 'activa' | 'finalizada' | 'cancelada';
// activities.audience CHECK (migración 034). Gobierna cómo se clasifican los
// acompañantes: 'adultos' → companions_adults, 'infantil' → companions_children.
export type ActivityAudience = 'adultos' | 'infantil';

// invitations.status CHECK (migración 006_invitations_and_checkin.sql).
export type InvitationStatus = 'pending' | 'confirmed' | 'declined' | 'expired' | 'canceled';
