// apps/web/lib/api/protocol.ts · fetcher server-side del dashboard de Protocolo.
import { ProtocolDashboardResponseSchema, type ProtocolDashboardResponse } from '@contan2/contracts';
import { apiGet } from './client';

export async function getProtocolDashboard(): Promise<ProtocolDashboardResponse | null> {
  try {
    return await apiGet('/api/v2/protocol/dashboard', ProtocolDashboardResponseSchema);
  } catch {
    return null;
  }
}
