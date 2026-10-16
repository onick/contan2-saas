// fixtures/roles.ts · roles de staff de test y sus storageState.
import path from 'node:path';
import { AUTH_DIR, env } from '../env';

export const ROLES = ['owner', 'admin', 'operator', 'consulta', 'puerta', 'protocolo', 'biblioteca'] as const;
export type Role = (typeof ROLES)[number];

export function roleEmail(role: Role): string {
  if (role === 'owner') return env('E2E_OWNER_EMAIL');
  return `e2e-${role}@test.local`;
}

export function rolePassword(role: Role): string {
  return env(`E2E_${role.toUpperCase()}_PASSWORD`);
}

export function statePath(name: Role | 'scanner' | 'platform'): string {
  return path.join(AUTH_DIR, `${name}.json`);
}
