// BFF POST → api-v2 POST /api/v2/users (alta de visitante; cookie + forwarded).
import { proxyUserCreate } from '../../../../lib/api/profile-proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return proxyUserCreate(await request.text());
}
