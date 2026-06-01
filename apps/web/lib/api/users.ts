// apps/web/lib/api/users.ts · fetcher read-only de visitantes.
// Mapea User (GET /api/v2/users) → la forma UserRow de UsersTable. La PII real
// (email/teléfono) llega solo para staff autenticado del mismo tenant (la
// frontera la pone api-v2: sesión + cross-tenant). Devuelve null si falla → la
// página cae a demoData.

import { UsersListResponseSchema, type User } from '@contan2/contracts';
import { apiGet } from './client';
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

// Vista completa de Usuarios: un fetch deriva tabla + KPIs + conteos de pills
// (todo-real o todo-demo). `total` es real (response.total); el resto (nuevos/
// recurrentes/retorno y los conteos por estado) es sobre el SET CARGADO
// (limit 100) — exacto para tenants con <100 usuarios, estimación si hay más.
export interface UsersView {
  users: UserRow[];
  total: number;
  nuevos: number;
  recurrentes: number;
  retornoPct: number;
  activos: number;
  inactivos: number;
}

export async function getUsersView(): Promise<UsersView | null> {
  try {
    const { items, total } = await apiGet('/api/v2/users?limit=100', UsersListResponseSchema);
    const users = items.map(toUserRow);
    const setSize = users.length || 1;
    const recurrentes = users.filter((u) => u.visits > 1).length;
    return {
      users,
      total,
      nuevos: users.filter((u) => u.status === 'nuevo').length,
      recurrentes,
      retornoPct: Math.round((recurrentes / setSize) * 100),
      activos: users.filter((u) => u.status === 'activo').length,
      inactivos: users.filter((u) => u.status === 'inactivo').length,
    };
  } catch {
    return null;
  }
}
