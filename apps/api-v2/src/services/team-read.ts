// apps/api-v2/src/services/team-read.ts · lectura del equipo (staff_members) del
// tenant. Read-only, tenant-scoped. SELECCIÓN SEGURA: sólo columnas permitidas
// (nombre/email/rol/status/último acceso/alta) — NUNCA password_hash, mfa_secret,
// failed_attempts, locked_until, lock_level, last_attempt_at, last_login_ip_hash,
// must_change_password ni deleted_at. Excluye soft-deleted (deleted_at IS NULL).
// Paginación por offset (los equipos son chicos) + búsqueda + filtros rol/status.

import type { DbClient } from '@contan2/db';

export const TEAM_PAGE_DEFAULT = 50;
export const TEAM_PAGE_MAX = 100;

export interface TeamFilters {
  q?: string;
  role?: string;
  status?: string;
  cursor?: string; // offset numérico de la página previa
  limit?: number;
}

export interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface TeamPage {
  items: TeamMember[];
  nextCursor: string | null;
}

const iso = (d: unknown): string | null => {
  if (!d) return null;
  return (d instanceof Date ? d : new Date(d as string)).toISOString();
};

export async function readTeam(db: DbClient, orgId: string, f: TeamFilters): Promise<TeamPage> {
  const limit = Math.min(Math.max(1, f.limit ?? TEAM_PAGE_DEFAULT), TEAM_PAGE_MAX);
  const offset = f.cursor && /^\d+$/.test(f.cursor) ? Math.min(Number(f.cursor), 100_000) : 0;

  let q = db
    .selectFrom('staff_members')
    .select(['id', 'full_name', 'email', 'role', 'status', 'last_login_at', 'created_at'])
    .where('organization_id', '=', orgId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit + 1)
    .offset(offset);

  if (f.q && f.q.trim()) {
    const like = `%${f.q.trim()}%`;
    q = q.where((eb) => eb.or([eb('full_name', 'ilike', like), eb('email', 'ilike', like)]));
  }
  if (f.role) q = q.where('role', '=', f.role as never);
  if (f.status) q = q.where('status', '=', f.status as never);

  const rows = await q.execute();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items: TeamMember[] = page.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    role: String(r.role),
    status: String(r.status),
    lastLoginAt: iso(r.last_login_at),
    createdAt: iso(r.created_at) ?? '',
  }));

  return { items, nextCursor: hasMore ? String(offset + limit) : null };
}
