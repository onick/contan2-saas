// BFF acciones sobre un tenant → api-v2 /platform/tenants/:id/:action.
// POST: suspend | reactivate. PATCH: plan | trial | notes. api-v2 arbitra
// (guard platform, validación, auditoría, rate-limit).
import { proxyPlatform } from '../../../../../../lib/api/platform-proxy';

export const dynamic = 'force-dynamic';

const POST_ACTIONS = new Set(['suspend', 'reactivate']);
const PATCH_ACTIONS = new Set(['plan', 'trial', 'notes']);

async function handle(method: 'POST' | 'PATCH', req: Request, params: Promise<{ id: string; action: string }>): Promise<Response> {
  const { id, action } = await params;
  const allowed = method === 'POST' ? POST_ACTIONS : PATCH_ACTIONS;
  if (!allowed.has(action)) return Response.json({ error: 'Acción inválida.' }, { status: 404 });
  let body: unknown;
  try { body = await req.json(); } catch { body = undefined; }
  return proxyPlatform(method, `/api/v2/platform/tenants/${encodeURIComponent(id)}/${action}`, body);
}

export function POST(req: Request, ctx: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  return handle('POST', req, ctx.params);
}
export function PATCH(req: Request, ctx: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  return handle('PATCH', req, ctx.params);
}
