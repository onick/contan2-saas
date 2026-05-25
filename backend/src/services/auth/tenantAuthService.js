// =============================================================================
// tenantAuthService.js · orquestador del flujo de auth para staff de tenant.
//
// Composé los servicios base (passwordService, lockoutService, sessionService)
// + los repos para producir las operaciones de alto nivel: login, logout,
// forgot-password, reset-password, change-password.
//
// Los errores son HttpError de errorHandler — los routers los propagan tal cual.
// =============================================================================

import { HttpError } from '../../middleware/errorHandler.js';
import { config } from '../../config.js';
import {
  hashPassword,
  verifyPassword,
  generateOpaqueToken,
  hashToken,
  validatePasswordStrength,
} from './passwordService.js';
import {
  isCurrentlyLocked,
  recordFailedAttempt,
  recordSuccessfulLogin,
} from './lockoutService.js';
import {
  createSession,
  revokeSession,
  revokeAllOtherSessions,
} from './sessionService.js';
import {
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendNewLoginNotificationEmail,
} from './authEmails.js';
import { maskEmail } from '../../utils/log.js';
import { createHash } from 'node:crypto';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hora

function sha256(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

/**
 * Login de un staff de tenant.
 *
 * @param {Object} args
 * @param {Object} args.organization fila de la org actual (de resolveTenant)
 * @param {Object} args.repos { staff: StaffMemberRepository, session: StaffSessionRepository }
 * @param {string} args.email
 * @param {string} args.password
 * @param {boolean} args.rememberMe
 * @param {string} args.ip
 * @param {string} args.userAgent
 * @returns {Promise<{ staff, sessionToken, expiresAt, mustChangePassword }>}
 * @throws {HttpError} 401 credenciales, 423 lockeada, 403 status no active
 */
export async function login({ organization, repos, email, password, rememberMe, ip, userAgent }) {
  const staff = await repos.staff.findByEmail(organization.id, email);
  if (!staff) {
    // Comportamiento constante en tiempo: hash dummy para no leak (atacante mide latencia)
    await verifyPassword('dummy_password_for_timing', '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXk$ZHVtbXk');
    throw new HttpError(401, 'Credenciales inválidas');
  }

  if (staff.status !== 'active') {
    throw new HttpError(403, 'Cuenta no activa. Contacta al administrador.');
  }

  // Lockout check ANTES de validar password
  const lockState = isCurrentlyLocked({
    failedAttempts: staff.failedAttempts,
    lockedUntil: staff.lockedUntil,
    lockLevel: staff.lockLevel,
    lastAttemptAt: staff.lastAttemptAt,
  });
  if (lockState.locked) {
    throw new HttpError(423, `Cuenta bloqueada temporalmente. Reintenta en ${Math.ceil(lockState.remainingMs / 60000)} minutos.`);
  }

  const ok = await verifyPassword(password, staff.passwordHash);
  if (!ok) {
    // Registra el intento fallido (puede causar lockout si llegó al límite)
    const result = recordFailedAttempt({
      failedAttempts: staff.failedAttempts,
      lockedUntil: staff.lockedUntil,
      lockLevel: staff.lockLevel,
      lastAttemptAt: staff.lastAttemptAt,
    });
    await repos.staff.applyLockoutUpdate(staff.id, result.updates);
    if (result.locked) {
      console.log(`[auth] LOCKOUT staff=${maskEmail(staff.email)} level=${result.lockLevel} until=${result.lockedUntil.toISOString()}`);
      throw new HttpError(423, result.message);
    }
    throw new HttpError(401, 'Credenciales inválidas');
  }

  // Login exitoso → limpia lockout, registra last_login
  const successResult = recordSuccessfulLogin({
    failedAttempts: staff.failedAttempts,
    lockedUntil: staff.lockedUntil,
    lockLevel: staff.lockLevel,
    lastAttemptAt: staff.lastAttemptAt,
  });
  const ipHash = ip ? sha256(ip) : null;
  await repos.staff.recordSuccessfulLogin(staff.id, {
    ipHash,
    lockoutUpdates: successResult.updates,
  });

  // Notificación de nueva IP (no bloqueante)
  const isNewIp = ipHash && staff.lastLoginIpHash && ipHash !== staff.lastLoginIpHash;
  if (isNewIp) {
    sendNewLoginNotificationEmail({
      staffMember: staff,
      organization,
      ip,
      userAgent,
      at: new Date(),
    }).catch(err => console.error('[auth] new-login email falló:', err.message));
  }

  // Crear sesión
  const { token, expiresAt } = await createSession({
    repo: repos.session,
    accountId: staff.id,
    rememberMe,
    ip,
    userAgent,
  });

  console.log(`[auth] login_success staff=${maskEmail(staff.email)} org=${organization.slug} remember=${!!rememberMe}`);

  return {
    staff: publicStaff(staff),
    sessionToken: token,
    expiresAt,
    mustChangePassword: !!staff.mustChangePassword,
  };
}

/**
 * Logout: revoca la sesión actual.
 */
export async function logout({ repos, sessionId }) {
  await revokeSession({ repo: repos.session, sessionId });
  console.log(`[auth] logout session=${sessionId}`);
}

/**
 * Forgot password: SIEMPRE responde OK (no leak de qué emails existen).
 * Si el email existe, genera token y manda email.
 */
export async function forgotPassword({ organization, repos, email, ip, userAgent }) {
  if (!email) return; // no leak: respuesta vacía igualmente OK

  const staff = await repos.staff.findByEmail(organization.id, email);
  if (!staff || staff.status !== 'active') {
    console.log(`[auth] forgot_password no_match email=${maskEmail(email)} org=${organization.slug}`);
    return;
  }

  const { plain, hash } = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  const ipHash = ip ? sha256(ip) : null;
  await repos.reset.create({
    accountId: staff.id,
    tokenHash: hash,
    expiresAt,
    ipHash,
    userAgent: userAgent ? String(userAgent).slice(0, 256) : null,
  });

  const baseUrl = buildBaseUrl(organization);
  const resetUrl = `${baseUrl}/login/reset?token=${plain}`;

  try {
    await sendPasswordResetEmail({
      staffMember: staff,
      organization,
      resetUrl,
    });
    console.log(`[auth] forgot_password sent email=${maskEmail(staff.email)} org=${organization.slug}`);
  } catch (e) {
    console.error('[auth] forgot_password email_fail:', e.message);
  }
}

/**
 * Reset password con token. Si OK, actualiza pass + revoca todas las sesiones.
 */
export async function resetPassword({ repos, token, newPassword }) {
  const strengthErrs = validatePasswordStrength(newPassword);
  if (strengthErrs.length) {
    throw new HttpError(400, 'Password débil: ' + strengthErrs.join(', '));
  }

  const tokenHash = hashToken(token);
  const resetRow = await repos.reset.findByTokenHash(tokenHash);
  if (!resetRow) {
    throw new HttpError(400, 'Token inválido o expirado. Solicita un nuevo enlace.');
  }

  const staff = await repos.staff.findById(resetRow.accountId);
  if (!staff || staff.status !== 'active') {
    throw new HttpError(400, 'Cuenta no disponible.');
  }

  const newHash = await hashPassword(newPassword);
  await repos.staff.updatePassword(staff.id, newHash);
  await repos.reset.markUsed(resetRow.id);
  // Invalida TODAS las sesiones — fuerza re-login con la nueva
  await revokeAllOtherSessions({ repo: repos.session, accountId: staff.id });

  console.log(`[auth] reset_password success staff=${maskEmail(staff.email)}`);

  // Notificación (best-effort)
  try {
    await sendPasswordChangedEmail({
      staffMember: staff,
      organization: { id: staff.organizationId },
      via: 'reset',
    });
  } catch (e) { console.error('[auth] password_changed email_fail:', e.message); }
}

/**
 * Change password (autenticado). Mantiene la sesión actual, revoca otras.
 */
export async function changePassword({ repos, staff, currentSessionId, currentPassword, newPassword }) {
  const strengthErrs = validatePasswordStrength(newPassword);
  if (strengthErrs.length) {
    throw new HttpError(400, 'Password débil: ' + strengthErrs.join(', '));
  }

  const ok = await verifyPassword(currentPassword, staff.passwordHash);
  if (!ok) {
    throw new HttpError(401, 'La contraseña actual no es correcta.');
  }

  const newHash = await hashPassword(newPassword);
  await repos.staff.updatePassword(staff.id, newHash);
  // Revoca otras sesiones pero mantiene la actual
  await revokeAllOtherSessions({
    repo: repos.session,
    accountId: staff.id,
    exceptSessionId: currentSessionId,
  });

  console.log(`[auth] change_password staff=${maskEmail(staff.email)}`);

  try {
    await sendPasswordChangedEmail({
      staffMember: staff,
      organization: { id: staff.organizationId },
      via: 'change',
    });
  } catch (e) { console.error('[auth] password_changed email_fail:', e.message); }
}

/**
 * Vista pública del staff (sin password_hash, sin tracking interno).
 */
export function publicStaff(staff) {
  return {
    id: staff.id,
    organizationId: staff.organizationId,
    email: staff.email,
    fullName: staff.fullName,
    status: staff.status,
    mustChangePassword: !!staff.mustChangePassword,
    mfaEnabled: !!staff.mfaEnabled,
    lastLoginAt: staff.lastLoginAt,
    createdAt: staff.createdAt,
  };
}

function buildBaseUrl(organization) {
  // Prioridad: custom domain verificado > slug.ROOT_DOMAIN
  if (organization.customDomain && organization.customDomainVerifiedAt) {
    return `https://${organization.customDomain}`;
  }
  return `https://${organization.slug}.${config.ROOT_DOMAIN}`;
}
