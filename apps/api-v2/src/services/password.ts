// apps/api-v2/src/services/password.ts · verificación Y creación de hashes de
// password de staff. Usa @node-rs/argon2 (prebuilt, sin node-gyp) con el formato
// PHC estándar `$argon2id$...`. hashStaffPassword fija LOS MISMOS parámetros que
// v1 (argon2id · m=19456,t=2,p=1) para que los hashes sean cross-compatibles en
// ambas direcciones (v1 verifica lo que v2 escribe y viceversa) — requisito del
// período de convivencia v1/v2 sobre la MISMA tabla staff_members.

import { verify, hash } from '@node-rs/argon2';

// Parámetros de v1 (backend/src/services/auth/passwordService.js).
const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hashStaffPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTS);
}

export async function verifyStaffPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  if (!passwordHash || !password) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    // Hash malformado / algoritmo desconocido → no autentica (no lanza).
    return false;
  }
}
