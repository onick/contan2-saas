// apps/web/app/kiosko/suggest/route.ts · proxy GET read-only del typeahead del
// kiosko. El cliente llama same-origin con fetch('/kiosko/suggest?q='); acá se
// resuelve server-side (apiGet es server-only) contra /api/v2/public/users/suggest.
// Devuelve SIEMPRE 200 { suggestions: [...] } (lista vacía ante error/umbral
// corto): el typeahead es silencioso. NO escribe nada.

import { suggestKioskVisitors } from '../../../lib/api/kiosko';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 3) return Response.json({ suggestions: [] });
  const suggestions = await suggestKioskVisitors(q);
  return Response.json({ suggestions });
}
