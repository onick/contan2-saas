// apps/web/lib/api/forwarded.ts · headers de forwarding web-v2 → api-v2.
//
// api-v2 es INTERNO; el navegador le llega vía estos proxies same-origin. Para
// que api-v2 resuelva el tenant y aplique rate-limit por IP REAL, web-v2 reenvía:
//   - x-forwarded-host: el host original del tenant (para resolveTenantFromHost).
//   - x-forwarded-for: la cadena de IP del cliente TAL CUAL entra desde Traefik.
//
// Regla de seguridad: NO se inventa IP. Si la request entrante no trae
// x-forwarded-for, no se manda ninguno (api-v2 cae a la IP del socket). Si trae
// una cadena ("client, proxy"), se preserva VERBATIM: api-v2 corre trustProxy=1
// (#29), que confía sólo en el proxy inmediato y toma la IP que ESTE reenvía
// (el extremo derecho que agrega Traefik), así que reenviar la cadena entrante
// es correcto y no spoofeable (el extremo izquierdo, puesto por el cliente, se
// ignora). No se ANTEPONE el peer de web-v2 (sería la IP de Traefik, inútil).

import { headers } from 'next/headers';

export async function forwardingHeaders(): Promise<Record<string, string>> {
  const h = await headers();
  const out: Record<string, string> = {};
  const host = h.get('host');
  if (host) out['x-forwarded-host'] = host;
  const xff = h.get('x-forwarded-for');
  if (xff) out['x-forwarded-for'] = xff;
  return out;
}
