// apps/api-v2/src/services/lockout.ts · bloqueo escalado anti fuerza-bruta por
// CUENTA. Port PURO (funcional, sin IO) de v1 backend/src/services/auth/
// lockoutService.js — misma política para que ambas versiones convivan sobre
// las MISMAS columnas de staff_members:
//   · 5 intentos fallidos en 15 min → lock
//   · nivel 1: 30 min · nivel 2: 1 h · nivel 3: 24 h
//   · reset a nivel 0 con login exitoso o tras 24 h sin intentos

const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_BEFORE_LOCK = 5;
const LOCK_DURATIONS_MS = [30 * 60 * 1000, 60 * 60 * 1000, 24 * 60 * 60 * 1000] as const;
const RESET_AFTER_NO_ATTEMPTS_MS = 24 * 60 * 60 * 1000;

export interface LockoutState {
  failedAttempts: number;
  lockedUntil: Date | null;
  lockLevel: number; // 0..3
  lastAttemptAt: Date | null;
}

export function isLocked(state: LockoutState, now = new Date()): boolean {
  return !!state.lockedUntil && state.lockedUntil.getTime() > now.getTime();
}

export function lockedMessage(state: LockoutState, now = new Date()): string {
  const mins = state.lockedUntil
    ? Math.max(1, Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 60_000))
    : 1;
  return `Cuenta bloqueada temporalmente por intentos fallidos. Probá de nuevo en ${mins} minuto${mins === 1 ? '' : 's'}.`;
}

export interface LockoutAttemptResult {
  locked: boolean;
  lockedUntil: Date | null;
  lockLevel: number;
  failedAttempts: number;
}

// Evalúa un intento FALLIDO y devuelve el próximo estado a persistir.
export function registerFailedAttempt(state: LockoutState, now = new Date()): LockoutAttemptResult {
  let { failedAttempts, lockLevel } = state;

  // 24h sin tocar la cuenta → estado viejo se descarta (nivel incluido).
  if (state.lastAttemptAt && now.getTime() - state.lastAttemptAt.getTime() > RESET_AFTER_NO_ATTEMPTS_MS) {
    failedAttempts = 0;
    lockLevel = 0;
  }
  // Fuera de la ventana de 15 min → el contador arranca de nuevo (el nivel se
  // conserva: reincidencia escala el castigo, paridad v1).
  else if (state.lastAttemptAt && now.getTime() - state.lastAttemptAt.getTime() > FAIL_WINDOW_MS) {
    failedAttempts = 0;
  }

  failedAttempts += 1;
  if (failedAttempts < MAX_FAILS_BEFORE_LOCK) {
    return { locked: false, lockedUntil: null, lockLevel, failedAttempts };
  }

  const nextLevel = Math.min(lockLevel + 1, LOCK_DURATIONS_MS.length);
  const lockedUntil = new Date(now.getTime() + LOCK_DURATIONS_MS[nextLevel - 1]!);
  return { locked: true, lockedUntil, lockLevel: nextLevel, failedAttempts: 0 };
}
