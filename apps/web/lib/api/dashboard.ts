// apps/web/lib/api/dashboard.ts · fetcher read-only de KPIs del dashboard.
// Mapea la respuesta de GET /api/v2/dashboard/metrics a las tarjetas que
// consume MetricCard. Devuelve null si no hay datos reales (sin sesión /
// api-v2 caído) → la página cae a demoData.

import { DashboardMetricsResponseSchema, UsersListResponseSchema } from '@contan2/contracts';
import { apiGet } from './client';
import type { DashboardMetric, RecentVisitor } from '../dashboard/demoData';

export async function getDashboardMetricCards(): Promise<DashboardMetric[] | null> {
  try {
    const { metrics } = await apiGet('/api/v2/dashboard/metrics', DashboardMetricsResponseSchema);
    // Sin tendencias: la API entrega conteos crudos, no series → no inventamos %.
    return [
      { key: 'asistencias', label: 'Asistencias', value: metrics.totalAttendance.toLocaleString('en-US') },
      { key: 'visitantes', label: 'Visitantes', value: metrics.totalUsers.toLocaleString('en-US') },
      { key: 'activas', label: 'Actividades activas', value: String(metrics.activeActivities) },
      { key: 'checkins', label: 'Check-ins', value: metrics.checkedIn.toLocaleString('en-US') },
    ];
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
