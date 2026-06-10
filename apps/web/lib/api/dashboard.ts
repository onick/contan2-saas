// apps/web/lib/api/dashboard.ts · fetcher read-only de KPIs del dashboard.
// Mapea la respuesta de GET /api/v2/dashboard/metrics a las tarjetas que
// consume MetricCard. Devuelve null si no hay datos reales (sin sesión /
// api-v2 caído) → la página cae a demoData.

import { UsersListResponseSchema, DashboardOverviewResponseSchema, type DashboardOverviewResponse } from '@contan2/contracts';
import { apiGet } from './client';
import type { RecentVisitor } from '../dashboard/demoData';

// Overview período-aware (S2, paridad v1): serie + deltas + upcoming + insights.
// null si no hay datos reales (sin sesión / api caída) → indisponibilidad
// honesta, nunca demo.
export async function getDashboardOverview(period: string): Promise<DashboardOverviewResponse | null> {
  try {
    return await apiGet(`/api/v2/dashboard/overview?period=${encodeURIComponent(period)}`, DashboardOverviewResponseSchema);
  } catch {
    return null;
  }
}

// Últimos visitantes = GET /api/v2/users (la API ya ordena por alta desc), los
// primeros N. Devuelve null si falla → la sección cae a demoData.
export async function getRecentVisitors(limit = 6): Promise<RecentVisitor[] | null> {
  try {
    const { items } = await apiGet(`/api/v2/users?limit=${limit}`, UsersListResponseSchema);
    return items.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      code: u.code,
      email: u.email ?? '—',
      visits: u.visitCount,
    }));
  } catch {
    return null;
  }
}
