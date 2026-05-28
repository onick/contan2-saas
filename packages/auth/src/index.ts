// packages/auth/src/index.ts · superficie pública de @contan2/auth.

export { hashToken } from './tokens.js';
export { validateStaffSession, type ValidatedSession } from './session.js';
export {
  loadActiveStaffById,
  publicStaff,
  type StaffRecord,
  type PublicStaff,
} from './staff.js';
export {
  resolveStaffSession,
  type ResolvedStaffSession,
  type ResolveOpts,
} from './resolve.js';
