// apps/web/lib/api/users.ts · fetcher read-only de visitantes (User Intelligence
// UI-1). Mapea UserListItem (GET /api/v2/users) → UserRow de UsersTable, con
// última visita real, estado de credencial y estado de actividad derivado. La PII
// real (email/teléfono) llega solo para staff autenticado del mismo tenant (la
// frontera la pone api-v2: sesión + cross-tenant). Devuelve null si falla → la
// página cae a Unavailable (o demo solo en dev con flag).

import {
  UsersListResponseSchema, UsersFacetsResponseSchema,
  type UserListItem, type UsersFacetsResponse, type UserCohort,
} from '@contan2/contracts';
import { apiGet } from './client';
import { toApiQuery, type UserStatusFilter } from '../admin/list-params';
import type { UserRow, RowTone } from '../usuarios/demoData';

const DATE_FMT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

// Relativo simple desde una fecha ISO ("hoy", "hace N días/semanas/meses").
function relativeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  if (days < 7) return `hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? 'hace 1 semana' : `hace ${weeks} semanas`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
}

// Estado de credencial a partir de credentialSentAt + email (regla v1):
//   credencial enviada → "Enviada"; con email y sin enviar → "Pendiente";
//   sin email → "Sin email".
function credentialOf(u: UserListItem): { label: string; tone: RowTone } {
  if (u.credentialSentAt) return { label: 'Enviada', tone: 'success' };
  if (u.email) return { label: 'Pendiente', tone: 'warning' };
  return { label: 'Sin email', tone: 'neutral' };
}

// Estado de actividad derivado (del API): active/dormant/null. null = zona
// intermedia 31–90 días → sin etiqueta (la tabla muestra "—").
function statusOf(u: UserListItem): { label: string; tone: RowTone } {
  if (u.status === 'active') return { label: 'Activo', tone: 'success' };
  if (u.status === 'dormant') return { label: 'Dormido', tone: 'neutral' };
  return { label: '', tone: 'neutral' };
}

function toUserRow(u: UserListItem): UserRow {
  const cred = credentialOf(u);
  const st = statusOf(u);
  return {
    id: u.id,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email ?? '—', // PII real; "—" si no tiene email
    code: u.code,
    registeredAt: DATE_FMT.format(new Date(u.createdAt)),
    registeredAgo: relativeAgo(u.createdAt),
    visits: u.visitCount,
    lastVisit: u.lastVisitAt ? relativeAgo(u.lastVisitAt) : 'Nunca',
    // status enum (fallback de tono); el display real va por statusTone/Label.
    status: u.status === 'active' ? 'activo' : 'inactivo',
    statusLabel: st.label,
    statusTone: st.tone,
    credentialLabel: cred.label,
    credentialTone: cred.tone,
    archived: !!u.deletedAt,
  };
}

export interface UsersPage {
  users: UserRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface UsersPageParams {
  limit: number;
  offset: number;
  q?: string;
  cohort?: UserCohort;
  status?: UserStatusFilter;
}

// Página de Usuarios (paginación + búsqueda + cohorte SERVER-SIDE). `total` es el
// REAL del filtro aplicado (la API cuenta en SQL). null si la API falla → la
// página muestra Unavailable (jamás demo, salvo dev con flag).
export async function getUsersPage(params: UsersPageParams): Promise<UsersPage | null> {
  try {
    const qs = toApiQuery({ limit: params.limit, offset: params.offset, q: params.q, cohort: params.cohort, status: params.status });
    const { items, total, limit, offset } = await apiGet(
      `/api/v2/users?${qs}`,
      UsersListResponseSchema,
    );
    return { users: items.map(toUserRow), total, limit, offset };
  } catch {
    return null;
  }
}

// Conteos exactos por cohorte (para las pills), dentro de la búsqueda `q` vigente.
// null si falla → la UI oculta los conteos pero las pills siguen navegables.
export async function getUsersFacets(q?: string, status?: UserStatusFilter): Promise<UsersFacetsResponse['counts'] | null> {
  try {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (status && status !== 'active') sp.set('status', status);
    const { counts } = await apiGet(`/api/v2/users/facets?${sp.toString()}`, UsersFacetsResponseSchema);
    return counts;
  } catch {
    return null;
  }
}
