// apps/web/lib/api/users.ts · fetcher read-only de visitantes.
// Mapea User (GET /api/v2/users) → la forma UserRow de UsersTable. La PII real
// (email/teléfono) llega solo para staff autenticado del mismo tenant (la
// frontera la pone api-v2: sesión + cross-tenant). Devuelve null si falla → la
// página cae a demoData.

import { UsersListResponseSchema, type User } from '@contan2/contracts';
import { apiGet } from './client';
import { toApiQuery } from '../admin/list-params';
import type { UserRow, UserStatus } from '../usuarios/demoData';

const DATE_FMT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

// Relativo simple desde la fecha de alta (la API no provee "última visita").
function relativeAgo(createdAtIso: string): string {
  const days = Math.floor((Date.now() - new Date(createdAtIso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  if (days < 7) return `hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? 'hace 1 semana' : `hace ${weeks} semanas`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
}

// Estado derivado (la API no lo provee): sin visitas → inactivo; alta reciente
// (≤30 días) → nuevo; si no → activo.
function deriveStatus(createdAtIso: string, visits: number): { status: UserStatus; label: string } {
  if (visits === 0) return { status: 'inactivo', label: 'Inactivo' };
  const days = Math.floor((Date.now() - new Date(createdAtIso).getTime()) / 86_400_000);
  if (days <= 30) return { status: 'nuevo', label: 'Nuevo' };
  return { status: 'activo', label: 'Activo' };
}

function toUserRow(u: User): UserRow {
  const s = deriveStatus(u.createdAt, u.visitCount);
  return {
    id: u.id,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email ?? '—', // PII real; "—" si no tiene email
    code: u.code,
    registeredAt: DATE_FMT.format(new Date(u.createdAt)),
    registeredAgo: relativeAgo(u.createdAt),
    visits: u.visitCount,
    lastVisit: '—', // la API aún no provee última visita
    status: s.status,
    statusLabel: s.label,
  };
}

// Página de Usuarios (paginación + búsqueda SERVER-SIDE). Devuelve la fila ya
// mapeada + el `total` REAL del filtro aplicado (la API cuenta en SQL). Se
// eliminaron los KPIs derivados del slice cargado (eran engañosos con >100): el
// único KPI de cabecera honesto es `total`. null si la API falla → la página
// muestra Unavailable (jamás demo, salvo dev con flag).
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
}

export async function getUsersPage(params: UsersPageParams): Promise<UsersPage | null> {
  try {
    const qs = toApiQuery({ limit: params.limit, offset: params.offset, q: params.q });
    const { items, total, limit, offset } = await apiGet(
      `/api/v2/users?${qs}`,
      UsersListResponseSchema,
    );
    return { users: items.map(toUserRow), total, limit, offset };
  } catch {
    return null;
  }
}
