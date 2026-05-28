// packages/db/src/index.ts · superficie pública de @contan2/db.

export type {
  Database,
  OrganizationsTable,
  StaffMembersTable,
  StaffAuthSessionsTable,
  PlatformAdminsTable,
  PlatformSessionsTable,
  TenantAuditLogTable,
} from './schema.js';

export type {
  OrgStatus,
  OrgPlan,
  SidebarStyle,
  AccountStatus,
  StaffRole,
} from './enums.js';

export { createDb, getDb, closeDb, pingDb } from './pool.js';
export { withTenant } from './rls.js';
