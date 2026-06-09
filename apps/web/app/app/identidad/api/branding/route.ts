// BFF PATCH → api-v2 PATCH /api/v2/org/branding (cookie + forwarded).
import { proxyBrandingUpdate } from '../../../../../lib/api/branding-proxy';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request): Promise<Response> {
  return proxyBrandingUpdate(await request.text());
}
