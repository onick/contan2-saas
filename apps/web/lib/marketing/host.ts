// apps/web/lib/marketing/host.ts · ¿este host es el MARKETING de la
// plataforma (contan2.com / www) o un host de tenant? La raíz del host
// marketing muestra la landing; la raíz de un tenant redirige a /login.
// Espejo del concepto 'marketing' de apps/api-v2/src/tenant.ts (root/www).

export function isMarketingHost(
  rawHost: string | null | undefined,
  rootDomain: string = process.env.ROOT_DOMAIN ?? 'localhost',
): boolean {
  if (!rawHost) return false;
  const host = rawHost.split(':')[0]?.toLowerCase() ?? '';
  const root = rootDomain.split(':')[0]?.toLowerCase() ?? '';
  return host === root || host === `www.${root}`;
}
