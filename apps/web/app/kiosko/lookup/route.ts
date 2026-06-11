// apps/web/app/kiosko/lookup/route.ts · proxy GET read-only del lookup público.
// El lookup del kiosko es interactivo (client), pero apiGet es server-only; este
// handler lo resuelve server-side (host forwarding incluido) y el cliente lo
// llama same-origin con fetch('/kiosko/lookup?q='). NO escribe nada.
//
// Respuestas: 200 { visitor } (hallado) | 200 { visitor: null } (no encontrado /
// inválido) | 400 (falta q) | 502 (api caído / rate-limit / error). El "no
// encontrado" va en 200 con body nulo a propósito: un 404 por fetch ensucia la
// consola del navegador en cada búsqueda sin match. El cliente decide por el
// body (visitor null = "no te encontramos") y reserva el error (502) para
// "intentá de nuevo" (no cae a demo en modo API).

import { lookupKioskVisitor } from '../../../lib/api/kiosko';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return Response.json({ error: 'Falta el parámetro q (código o correo).' }, { status: 400 });
  }
  try {
    const out = await lookupKioskVisitor(q); // null = no encontrado
    if (out && 'matches' in out) return Response.json({ visitor: null, matches: out.matches });
    if (out && 'needsFullName' in out) return Response.json({ visitor: null, needsFullName: true, hint: out.hint });
    return Response.json({ visitor: out && 'visitor' in out ? out.visitor : null });
  } catch {
    return Response.json({ error: 'No pudimos consultar el registro. Intentá de nuevo.' }, { status: 502 });
  }
}
