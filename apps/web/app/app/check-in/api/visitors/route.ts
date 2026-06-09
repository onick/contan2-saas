import { proxyCheckinVisitors } from '../../../../../lib/api/checkin-proxy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request): Promise<Response> {
  return proxyCheckinVisitors(new URL(req.url).search);
}
