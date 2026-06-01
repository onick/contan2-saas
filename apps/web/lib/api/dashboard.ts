// apps/web/lib/api/dashboard.ts · fetcher read-only de KPIs del dashboard.
// Mapea la respuesta de GET /api/v2/dashboard/metrics a las tarjetas que
// consume MetricCard. Devuelve null si no hay datos reales (sin sesión /
// api-v2 caído) → la página cae a demoData.

import { DashboardMetricsResponseSchema } from '@contan2/contracts';
import { apiGet } from './client';
import type { DashboardMetric } from '../dashboard/demoData';

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
