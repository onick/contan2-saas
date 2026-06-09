// BFF PATCH → api-v2 PATCH /api/v2/org/team/:id/role (cookie + forwarded).
import { proxyTeamRole } from '../../../../../../lib/api/team-proxy';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyTeamRole(id, await request.text());
}
