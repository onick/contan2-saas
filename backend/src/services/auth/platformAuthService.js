// =============================================================================
// platformAuthService.js · orquestador de auth para platform admin
// (Marcelino y futuros operadores de contan2). Cross-tenant.
//
// API paralela a tenantAuthService, pero contra platform_admins. Reusa
// los mismos sub-servicios (passwordService, lockoutService, sessionService).
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

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function sha256(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

// Org "fake" para que los templates de email tengan branding default contan2.
// El platform admin NO pertenece a ningún tenant, pero los templates de
// email esperan un objeto organization-like (con campos como primaryColor,
// name, logoUrl). Usamos uno por defecto.
const PLATFORM_BRAND = {
  id: null,
  name: 'contan2',
  primaryColor: '#0182a2',
  secondaryColor: '#ff6f00',
  logoUrl: null,
  emailLogoUrl: null,
  sidebarStyle: 'brand',
};

export async function login({ repos, email, password, rememberMe, ip, userAgent }) {
  const admin = await repos.admin.findByEmail(email);
  if (!admin) {
    await verifyPassword('dummy_password_for_timing', '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXk$ZHVtbXk');
    throw new HttpError(401, 'Credenciales inválidas');
  }
  if (admin.status !== 'active') {
    throw new HttpError(403, 'Cuenta no activa.');
  }

  const lockState = isCurrentlyLocked({
    failedAttempts: admin.failedAttempts,
    lockedUntil: admin.lockedUntil,
    lockLevel: admin.lockLevel,
    lastAttemptAt: admin.lastAttemptAt,
  });
  if (lockState.locked) {
    throw new HttpError(423, `Cuenta bloqueada temporalmente. Reintenta en ${Math.ceil(lockState.remainingMs / 60000)} minutos.`);
  }

  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) {
    const result = recordFailedAttempt({
      failedAttempts: admin.failedAttempts,
      lockedUntil: admin.lockedUntil,
      lockLevel: admin.lockLevel,
      lastAttemptAt: admin.lastAttemptAt,
    });
    await repos.admin.applyLockoutUpdate(admin.id, result.updates);
    if (result.locked) {
      console.log(`[platform-auth] LOCKOUT admin=${maskEmail(admin.email)} level=${result.lockLevel}`);
      throw new HttpError(423, result.message);
    }
    throw new HttpError(401, 'Credenciales inválidas');
  }

  const successResult = recordSuccessfulLogin({
    failedAttempts: admin.failedAttempts,
    lockedUntil: admin.lockedUntil,
    lockLevel: admin.lockLevel,
    lastAttemptAt: admin.lastAttemptAt,
  });
  const ipHash = ip ? sha256(ip) : null;
  await repos.admin.recordSuccessfulLogin(admin.id, {
    ipHash,
    lockoutUpdates: successResult.updates,
  });

  // Notificación nueva IP
  const isNewIp = ipHash && admin.lastLoginIpHash && ipHash !== admin.lastLoginIpHash;
  if (isNewIp) {
    sendNewLoginNotificationEmail({
      staffMember: admin,
      organization: PLATFORM_BRAND,
      ip,
      userAgent,
      at: new Date(),
    }).catch(err => console.error('[platform-auth] new-login email falló:', err.message));
  }

  const { token, expiresAt } = await createSession({
    repo: repos.session,
    accountId: admin.id,
    rememberMe,
    ip,
    userAgent,
  });

  console.log(`[platform-auth] login_success admin=${maskEmail(admin.email)}`);

  return {
    admin: publicAdmin(admin),
    sessionToken: token,
    expiresAt,
    mustChangePassword: !!admin.mustChangePassword,
  };
}

export async function logout({ repos, sessionId }) {
  await revokeSession({ repo: repos.session, sessionId });
  console.log(`[platform-auth] logout session=${sessionId}`);
}

export async function forgotPassword({ repos, email, ip, userAgent }) {
  if (!email) return;
  const admin = await repos.admin.findByEmail(email);
  if (!admin || admin.status !== 'active') {
    console.log(`[platform-auth] forgot_password no_match email=${maskEmail(email)}`);
    return;
  }

  const { plain, hash } = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  const ipHash = ip ? sha256(ip) : null;
  await repos.reset.create({
    accountId: admin.id,
    tokenHash: hash,
    expiresAt,
    ipHash,
    userAgent: userAgent ? String(userAgent).slice(0, 256) : null,
  });

  // PLATFORM_PUBLIC_URL aísla el host del super admin del PUBLIC_URL del
  // tenant. Default deriva a https://admin.${ROOT_DOMAIN} en prod, y a
  // http://localhost:PORT en dev (ROOT_DOMAIN=localhost). En config.js.
  const resetUrl = `${config.PLATFORM_PUBLIC_URL}/login/reset?token=${plain}`;

  try {
    await sendPasswordResetEmail({
      staffMember: admin,
      organization: PLATFORM_BRAND,
      resetUrl,
    });
    console.log(`[platform-auth] forgot_password sent email=${maskEmail(admin.email)}`);
  } catch (e) {
    console.error('[platform-auth] forgot_password email_fail:', e.message);
  }
}

export async function resetPassword({ repos, token, newPassword }) {
  const strengthErrs = validatePasswordStrength(newPassword);
  if (strengthErrs.length) throw new HttpError(400, 'Password débil: ' + strengthErrs.join(', '));

  const tokenHash = hashToken(token);
  const resetRow = await repos.reset.findByTokenHash(tokenHash);
  if (!resetRow) throw new HttpError(400, 'Token inválido o expirado.');

  const admin = await repos.admin.findById(resetRow.accountId);
  if (!admin || admin.status !== 'active') throw new HttpError(400, 'Cuenta no disponible.');

  const newHash = await hashPassword(newPassword);
  await repos.admin.updatePassword(admin.id, newHash);
  await repos.reset.markUsed(resetRow.id);
  await revokeAllOtherSessions({ repo: repos.session, accountId: admin.id });

  console.log(`[platform-auth] reset_password success admin=${maskEmail(admin.email)}`);

  try {
    await sendPasswordChangedEmail({
      staffMember: admin,
      organization: PLATFORM_BRAND,
      via: 'reset',
    });
  } catch (e) { console.error('[platform-auth] password_changed email_fail:', e.message); }
}

export async function changePassword({ repos, admin, currentSessionId, currentPassword, newPassword }) {
  const strengthErrs = validatePasswordStrength(newPassword);
  if (strengthErrs.length) throw new HttpError(400, 'Password débil: ' + strengthErrs.join(', '));

  const ok = await verifyPassword(currentPassword, admin.passwordHash);
  if (!ok) throw new HttpError(401, 'La contraseña actual no es correcta.');

  const newHash = await hashPassword(newPassword);
  await repos.admin.updatePassword(admin.id, newHash);
  await revokeAllOtherSessions({
    repo: repos.session,
    accountId: admin.id,
    exceptSessionId: currentSessionId,
  });

  console.log(`[platform-auth] change_password admin=${maskEmail(admin.email)}`);

  try {
    await sendPasswordChangedEmail({
      staffMember: admin,
      organization: PLATFORM_BRAND,
      via: 'change',
    });
  } catch (e) { console.error('[platform-auth] password_changed email_fail:', e.message); }
}

export function publicAdmin(admin) {
  return {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    status: admin.status,
    mustChangePassword: !!admin.mustChangePassword,
    mfaEnabled: !!admin.mfaEnabled,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
  };
}
