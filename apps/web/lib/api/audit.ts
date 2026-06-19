// apps/web/lib/api/audit.ts · fetch server-side del overview del Historial
// (KPIs + donut + top actores + sospechosa) para el render inicial del dashboard.
import { AuditOverviewResponseSchema, type AuditOverviewResponse } from '@contan2/contracts';
import { apiGet } from './client';

export async function getAuditOverview(): Promise<AuditOverviewResponse | null> {
  try {
    return await apiGet('/api/v2/org/audit/overview', AuditOverviewResponseSchema);
  } catch {
    return null;
  }
}
