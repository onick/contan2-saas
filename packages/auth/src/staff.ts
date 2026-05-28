// packages/auth/src/staff.ts
// Carga staff activo + serializa a la forma pública con paridad EXACTA al
// publicStaff de v1 (backend/src/services/auth/tenantAuthService.js:264).

import type { Kysely } from 'kysely';
import type { Database, AccountStatus, StaffRole } from '@contan2/db';

// Subconjunto seleccionado de staff_members (Selectable: timestamps Date).
export interface StaffRecord {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  status: AccountStatus;
  role: StaffRole;
  must_change_password: boolean;
  mfa_enabled: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

// Shape de salida idéntico a v1.
export interface PublicStaff {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  status: AccountStatus;
  role: StaffRole;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/**
 * Carga un staff_member por id sólo si está vivo (deleted_at IS NULL) y
 * status === 'active'. Devuelve null en cualquier otro caso (suspended,
 * deleted o inexistente) — el caller mapea a 401, igual que v1.
 */
export async function loadActiveStaffById(
  db: Kysely<Database>,
  id: string,
): Promise<StaffRecord | null> {
  if (!id) return null;

  const row = await db
    .selectFrom('staff_members')
    .select([
      'id',
      'organization_id',
      'email',
      'full_name',
      'status',
      'role',
      'must_change_password',
      'mfa_enabled',
      'last_login_at',
      'created_at',
    ])
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();

  if (!row || row.status !== 'active') return null;
  return row;
}

export function publicStaff(row: StaffRecord): PublicStaff {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    role: row.role ?? 'operator',
    mustChangePassword: !!row.must_change_password,
    mfaEnabled: !!row.mfa_enabled,
    lastLoginAt: row.last_login_at ? toISO(row.last_login_at) : null,
    createdAt: toISO(row.created_at),
  };
}

function toISO(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
