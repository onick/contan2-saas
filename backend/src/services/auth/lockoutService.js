// =============================================================================
// lockoutService.js · cálculo de bloqueo escalado anti brute-force.
//
// Política:
//   - 5 intentos fallidos en una ventana de 15 min → cuenta queda lockeada
//   - Nivel 1 → 30 min de lock
//   - Nivel 2 → 1 hora
//   - Nivel 3 → 24 horas
//   - Reset a nivel 0 al login exitoso o al expirar 24h sin nuevos intentos
//
// Este módulo es funcional puro: dado el estado actual de un account
// (failed_attempts, locked_until, lock_level, last_attempt_at), calcula
// qué hacer. La persistencia la maneja el repo.
// =============================================================================

const FAIL_WINDOW_MS = 15 * 60 * 1000;    // 15 min para acumular fails
const MAX_FAILS_BEFORE_LOCK = 5;

const LOCK_DURATIONS_MS = [
  30 * 60 * 1000,        // nivel 1: 30 min
  60 * 60 * 1000,        // nivel 2: 1 hora
  24 * 60 * 60 * 1000,   // nivel 3: 24 horas
];

const RESET_AFTER_NO_ATTEMPTS_MS = 24 * 60 * 60 * 1000; // 24h sin tocar = wipe del estado

/**
 * Estado actual de la cuenta en términos de lockout.
 * @typedef {Object} LockoutState
 * @property {number} failedAttempts contador actual en la ventana
 * @property {Date|null} lockedUntil si tiene fecha futura, está bloqueada
 * @property {number} lockLevel 0..3 (3 = nivel máximo alcanzado)
 * @property {Date|null} lastAttemptAt última vez que hubo intento (ok o fail)
 */

/**
 * Resultado de evaluar un intento fallido.
 * @typedef {Object} LockoutAttemptResult
 * @property {boolean} locked si el intento puso a la cuenta bloqueada
 * @property {Date|null} lockedUntil cuándo expira el lock (null si no locked)
 * @property {number} lockLevel nuevo nivel
 * @property {number} failedAttempts contador actualizado
 * @property {string|null} message explicación humana (para devolver al cliente)
 */

/**
 * Determina si una cuenta está actualmente bloqueada.
 * Llamar ANTES de validar password — si está locked, ni siquiera intentes.
 *
 * @param {LockoutState} state
 * @param {Date} [now]
 * @returns {{ locked: boolean, lockedUntil: Date|null, remainingMs: number }}
 */
export function isCurrentlyLocked(state, now = new Date()) {
  if (!state?.lockedUntil) return { locked: false, lockedUntil: null, remainingMs: 0 };
  const until = state.lockedUntil instanceof Date ? state.lockedUntil : new Date(state.lockedUntil);
  if (isNaN(until.getTime())) return { locked: false, lockedUntil: null, remainingMs: 0 };
  const remainingMs = until.getTime() - now.getTime();
  if (remainingMs <= 0) return { locked: false, lockedUntil: null, remainingMs: 0 };
  return { locked: true, lockedUntil: until, remainingMs };
}

/**
 * Procesa un intento FALLIDO de login. Devuelve el nuevo estado a persistir.
 *
 * Reglas:
 * - Si la ventana de fails expiró (>15min sin fail), reinicia el contador a 1.
 * - Si dentro de la ventana llega a MAX_FAILS_BEFORE_LOCK, lockea con
 *   el siguiente nivel (escalado).
 * - Si han pasado 24h+ desde el último intento, el lock_level se reinicia a 0.
 *
 * @param {LockoutState} state estado actual antes del intento
 * @param {Date} [now]
 * @returns {LockoutAttemptResult & { updates: Partial<LockoutState> }}
 *   `updates` son las columnas a actualizar en la DB.
 */
export function recordFailedAttempt(state, now = new Date()) {
  const lastAttempt = state?.lastAttemptAt
    ? (state.lastAttemptAt instanceof Date ? state.lastAttemptAt : new Date(state.lastAttemptAt))
    : null;

  // ¿Hace más de 24h del último intento? El lockLevel también se enfría.
  const coolDown = lastAttempt && (now.getTime() - lastAttempt.getTime() > RESET_AFTER_NO_ATTEMPTS_MS);

  // ¿La ventana de fails expiró?
  const windowExpired = lastAttempt && (now.getTime() - lastAttempt.getTime() > FAIL_WINDOW_MS);

  const newFailedAttempts = (windowExpired || coolDown)
    ? 1
    : (state?.failedAttempts || 0) + 1;

  const currentLockLevel = coolDown ? 0 : (state?.lockLevel || 0);

  if (newFailedAttempts >= MAX_FAILS_BEFORE_LOCK) {
    // Escala al siguiente nivel (cap a 3)
    const nextLevel = Math.min(3, currentLockLevel + 1);
    const lockMs = LOCK_DURATIONS_MS[nextLevel - 1];
    const lockedUntil = new Date(now.getTime() + lockMs);
    return {
      locked: true,
      lockedUntil,
      lockLevel: nextLevel,
      failedAttempts: 0, // reset contador, ya está lockeada
      message: lockMessage(nextLevel, lockedUntil),
      updates: {
        failedAttempts: 0,
        lockedUntil,
        lockLevel: nextLevel,
        lastAttemptAt: now,
      },
    };
  }

  // Aún dentro del rango permitido (1..4 fails)
  return {
    locked: false,
    lockedUntil: null,
    lockLevel: currentLockLevel,
    failedAttempts: newFailedAttempts,
    message: null,
    updates: {
      failedAttempts: newFailedAttempts,
      lockLevel: currentLockLevel,
      lastAttemptAt: now,
    },
  };
}

/**
 * Procesa un login exitoso. Reinicia contadores.
 * (lockLevel NO se reinicia inmediatamente — sólo después de 24h sin
 * actividad maliciosa. Esto evita que un atacante "lave" el lockLevel
 * con un login legítimo eventual.)
 *
 * @param {LockoutState} state
 * @param {Date} [now]
 * @returns {{ updates: Partial<LockoutState> }}
 */
export function recordSuccessfulLogin(state, now = new Date()) {
  const lastAttempt = state?.lastAttemptAt
    ? (state.lastAttemptAt instanceof Date ? state.lastAttemptAt : new Date(state.lastAttemptAt))
    : null;
  const coolDown = lastAttempt && (now.getTime() - lastAttempt.getTime() > RESET_AFTER_NO_ATTEMPTS_MS);

  return {
    updates: {
      failedAttempts: 0,
      lockedUntil: null,
      lockLevel: coolDown ? 0 : (state?.lockLevel || 0),
      lastAttemptAt: now,
    },
  };
}

function lockMessage(level, until) {
  const durHuman = ['30 minutos', '1 hora', '24 horas'][level - 1] || 'un tiempo';
  return `Cuenta bloqueada temporalmente por seguridad. Reintenta en ${durHuman} (${until.toISOString()}).`;
}

// Exports para tests / introspección
export const CONFIG = Object.freeze({
  FAIL_WINDOW_MS,
  MAX_FAILS_BEFORE_LOCK,
  LOCK_DURATIONS_MS,
  RESET_AFTER_NO_ATTEMPTS_MS,
});
