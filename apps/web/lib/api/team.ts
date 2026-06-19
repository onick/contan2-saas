// apps/web/lib/api/team.ts · fetch server-side del overview del equipo (KPIs +
// resumen por rol) para el render inicial del dashboard.
import { TeamOverviewResponseSchema, type TeamOverviewResponse } from '@contan2/contracts';
import { apiGet } from './client';

export async function getTeamOverview(): Promise<TeamOverviewResponse | null> {
  try {
    return await apiGet('/api/v2/org/team/overview', TeamOverviewResponseSchema);
  } catch {
    return null;
  }
}
