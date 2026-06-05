// apps/api-v2/src/services/password.ts · verificación de password de staff.
// VERIFY-ONLY: api-v2 NUNCA crea ni re-hashea passwords (eso es de v1). Usa
// @node-rs/argon2 (prebuilt, sin node-gyp), que verifica el formato PHC estándar
// `$argon2id$...` producido por v1 (argon2id · m=19456,t=2,p=1). Los parámetros
// se leen del propio hash, así que la verificación es compatible cross-lib con
// la librería `argon2` (ranisalt) que usa v1.

import { verify } from '@node-rs/argon2';

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
