// packages/auth/src/tokens.ts
// hashToken DEBE ser byte-idéntico al de v1
// (backend/src/services/auth/passwordService.js):
//   createHash('sha256').update(String(plainToken)).digest('hex')
// Si esto difiere, la cookie contan2_session creada por v1 no validaría en
// v2. El test resolve.test.ts compara contra un valor conocido.

import { createHash } from 'node:crypto';

export function hashToken(plainToken: string): string {
  return createHash('sha256').update(String(plainToken)).digest('hex');
}
