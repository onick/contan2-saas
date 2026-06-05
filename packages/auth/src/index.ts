// packages/auth/src/index.ts · superficie pública de @contan2/auth.

export { hashToken } from './tokens.js';
export { validateStaffSession, type ValidatedSession } from './session.js';
export {
  loadActiveStaffById,
  loadStaffForLogin,
  publicStaff,
  type StaffRecord,
  type LoginStaffRecord,
  type PublicStaff,
} from './staff.js';
export {
  resolveStaffSession,
  type ResolvedStaffSession,
  type ResolveOpts,
} from './resolve.js';
// Escritura de sesiones (login/logout) — única superficie no read-only.
export {
  createStaffSession,
  revokeStaffSession,
  SESSION_TTL_MS,
  SESSION_REMEMBER_TTL_MS,
  type CreateSessionInput,
  type CreatedStaffSession,
} from './session-write.js';
