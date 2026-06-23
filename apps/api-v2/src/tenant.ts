// apps/api-v2/src/tenant.ts · resolución de tenant por host. Réplica de la
// lógica de v1 (backend/src/middleware/resolveTenant.js): parseHost +
// RESERVED_SUBDOMAINS + dev fallback localhost→ccb. Read-only.
//
// ROOT_DOMAIN se lee de process.env (config aún no lo expone; mismo patrón
// que @contan2/db con DATABASE_URL). Sin cache en PR #4 (se porta luego).

import type { FastifyRequest } from 'fastify';
import {
  type DbClient,
  findOrgBySlug,
  findOrgByCustomDomain,
  type TenantOrg,
} from '@contan2/db';

// Host efectivo del tenant. Detrás de un proxy (Coolify/Traefik) y en la llamada
// web→api interna, el host real del tenant llega en `x-forwarded-host` (lo setea
// el web vía apiGet), NO en `Host` (que es el del servicio interno). Solo se
// confía en `x-forwarded-host` cuando `TRUST_FORWARDED_HOST=1` (staging/prod tras
// un proxy de confianza); por defecto (dev/local/tests) se usa `Host`, sin
// cambio de comportamiento. Header puede venir como lista (varios proxies) →
// se toma el primer valor.
export function effectiveHost(req: FastifyRequest): string | undefined {
  if (process.env.TRUST_FORWARDED_HOST === '1') {
    const fwd = req.headers['x-forwarded-host'];
    const value = Array.isArray(fwd) ? fwd[0] : fwd;
    if (value) return value.split(',')[0]!.trim();
  }
  return req.headers.host;
}

// Subdominios que NUNCA son tenants (admin incluido → admin.contan2.com
// no resuelve como org). Igual conjunto que v1.
export const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'mail', 'email', 'smtp', 'imap', 'pop', 'pop3',
  'ftp', 'sftp', 'ssh', 'ns', 'ns1', 'ns2', 'dns', 'mx',
  'dashboard', 'panel', 'console', 'docs', 'help', 'support', 'status',
  'blog', 'news', 'kb', 'faq', 'pricing', 'billing', 'plans',
  'signup', 'signin', 'login', 'signout', 'logout', 'register', 'auth',
  'static', 'assets', 'cdn', 'files', 'uploads', 'media', 'images',
  'test', 'staging', 'dev', 'demo', 'sandbox', 'beta', 'alpha',
  'about', 'contact', 'privacy', 'terms', 'legal', 'security',
  'me', 'my', 'account', 'profile',
  'super', 'superadmin', 'internal', 'ops', 'devops',
  'monitor', 'metrics', 'log', 'logs',
  'contan2', 'contan2saas',
  'localhost',
]);

const DEV_FALLBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SUBDOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?)\.(.+)$/;

export type ParsedHost =
  | { kind: 'marketing' }
  | { kind: 'reserved'; slug: string }
  | { kind: 'subdomain'; slug: string }
  | { kind: 'custom'; host: string }
  | { kind: 'unknown' };

export function parseHost(
  host: string | undefined,
  rootDomain: string,
): ParsedHost {
  if (!host) return { kind: 'unknown' };
  const cleanHost = host.split(':')[0]!.toLowerCase();
  const root = rootDomain.toLowerCase();

  if (cleanHost === root || cleanHost === `www.${root}`) {
    return { kind: 'marketing' };
  }
  if (cleanHost.endsWith(`.${root}`)) {
    const m = cleanHost.match(SUBDOMAIN_RE);
    if (m && m[2] === root) {
      const slug = m[1]!;
      if (RESERVED_SUBDOMAINS.has(slug)) return { kind: 'reserved', slug };
      return { kind: 'subdomain', slug };
    }
  }
  return { kind: 'custom', host: cleanHost };
}

export type TenantResolution =
  | { ok: true; org: TenantOrg; source: string }
  | { ok: false; reason: 'not_tenant' | 'not_found' | 'suspended' };

export async function resolveTenantFromHost(
  db: DbClient,
  host: string | undefined,
  rootDomain: string = process.env.ROOT_DOMAIN ?? 'localhost',
): Promise<TenantResolution> {
  const cleanHost = (host ?? '').split(':')[0]!.toLowerCase();

  // Dev convenience: localhost sin subdominio → CCB (igual que v1).
  if (DEV_FALLBACK_HOSTS.has(cleanHost)) {
    const org = await findOrgBySlug(db, 'ccb');
    return org
      ? { ok: true, org, source: 'dev-fallback' }
      : { ok: false, reason: 'not_found' };
  }

  const parsed = parseHost(host, rootDomain);
  if (
    parsed.kind === 'marketing' ||
    parsed.kind === 'reserved' ||
    parsed.kind === 'unknown'
  ) {
    return { ok: false, reason: 'not_tenant' };
  }

  const org =
    parsed.kind === 'subdomain'
      ? await findOrgBySlug(db, parsed.slug)
      : await findOrgByCustomDomain(db, parsed.host);

  if (!org) return { ok: false, reason: 'not_found' };
  if (org.status === 'suspended') return { ok: false, reason: 'suspended' };
  return { ok: true, org, source: parsed.kind };
}
