// apps/web/lib/marketing/host.ts · ¿este host es el MARKETING de la
// plataforma (contan2.com / www) o un host de tenant? La raíz del host
// marketing muestra la landing; la raíz de un tenant redirige a /login.
// Espejo del concepto 'marketing' de apps/api-v2/src/tenant.ts (root/www).

/** Normaliza un host: primer valor de una lista, minúsculas, sin puerto. */
function normalizeHost(raw: string): string {
  return raw.split(',')[0]?.trim().split(':')[0]?.toLowerCase() ?? '';
}

/**
 * Host real de la petición. Detrás de Traefik el host público llega en
 * `x-forwarded-host`; `host` es el fallback. Único punto de lectura: el proxy
 * (ex-middleware) y cualquier página deben usar esto para no divergir.
 */
export function getRequestHost(headers: Pick<Headers, 'get'>): string | null {
  const raw = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!raw) return null;
  return normalizeHost(raw) || null;
}

/** ¿Es exactamente `www.<root>`? (se redirige 308 a la raíz). */
export function isWwwHost(
  rawHost: string | null | undefined,
  rootDomain: string = process.env.ROOT_DOMAIN ?? 'localhost',
): boolean {
  if (!rawHost) return false;
  return normalizeHost(rawHost) === `www.${normalizeHost(rootDomain)}`;
}

export function isMarketingHost(
  rawHost: string | null | undefined,
  rootDomain: string = process.env.ROOT_DOMAIN ?? 'localhost',
): boolean {
  if (!rawHost) return false;
  const host = normalizeHost(rawHost);
  const root = normalizeHost(rootDomain);
  return host === root || host === `www.${root}`;
}
