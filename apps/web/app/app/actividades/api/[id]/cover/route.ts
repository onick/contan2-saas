// app/app/actividades/api/[id]/cover/route.ts · proxy POST same-origin →
// api-v2 POST /api/v2/activities/:id/cover. Pasa el multipart entrante TAL CUAL
// (preservando el boundary) con cookie + forwarded headers. El navegador nunca
// llama a api-v2 directo.
import { proxyUploadCover } from '../../../../../../lib/api/activities-create';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return proxyUploadCover(id, req);
}
