// BFF PATCH → api-v2 PATCH /api/v2/org/team/:id/status (cookie + forwarded).
import { proxyTeamStatus } from '../../../../../../lib/api/team-proxy';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyTeamStatus(id, await request.text());
}
