// app/scanner/api/checkin/route.ts · proxy POST → api-v2 POST /public/checkin.
// El scanner identifica al visitante por código escaneado; el body lo arma el
// cliente como { activityId, visitor:{ code }, companionsChildren:0 }. Este
// handler NO valida ni transforma: api-v2 es el árbitro (cupo atómico, dup, etc).
import { proxyToApiV2 } from '../../../../lib/api/scanner';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  return proxyToApiV2({ method: 'POST', path: '/api/v2/public/checkin', body });
}
