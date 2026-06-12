// packages/db/src/enums.ts · uniones de string literals que reflejan los
// CHECK constraints de las migraciones v1. Single source para v2; cuando
// packages/contracts crezca, puede re-exportarlos.

export type OrgStatus = 'active' | 'suspended' | 'trial_ended' | 'deleted';
export type OrgPlan = 'free' | 'pro' | 'enterprise';
export type SidebarStyle = 'brand' | 'dark' | 'light';

// staff_members.status y platform_admins.status comparten este conjunto.
export type AccountStatus = 'active' | 'suspended' | 'deleted';

export type StaffRole = 'owner' | 'admin' | 'operator' | 'protocolo';

// activities.status CHECK (migración 001_initial.sql).
export type ActivityStatus = 'activa' | 'finalizada' | 'cancelada';

// invitations.status CHECK (migración 006_invitations_and_checkin.sql).
export type InvitationStatus = 'pending' | 'confirmed' | 'declined' | 'expired' | 'canceled';
