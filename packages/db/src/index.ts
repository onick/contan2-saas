// packages/db/src/index.ts · superficie pública de @contan2/db.

export type {
  Database,
  OrganizationsTable,
  StaffMembersTable,
  StaffAuthSessionsTable,
  PlatformAdminsTable,
  PlatformSessionsTable,
  TenantAuditLogTable,
  UsersTable,
  ActivitiesTable,
  AttendanceTable,
  InvitationsTable,
  SignupVerificationsTable,
} from './schema.js';

export type {
  OrgStatus,
  OrgPlan,
  SidebarStyle,
  AccountStatus,
  StaffRole,
  ActivityStatus,
  InvitationStatus,
} from './enums.js';

export { createDb, getDb, getPlatformDb, closeDb, pingDb, type DbClient } from './pool.js';
export { withTenant } from './rls.js';
export { findOrgBySlug, findOrgByCustomDomain, type TenantOrg } from './orgs.js';

// Re-export del helper `sql` y tipos de Kysely para que los consumidores del
// monorepo no necesiten kysely como dependencia directa.
export { sql } from 'kysely';
export type { RawBuilder } from 'kysely';
