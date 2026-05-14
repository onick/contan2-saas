import { config } from '../config.js';
import { initRepositories, CCB_ORG_ID } from '../db/repositories.js';
import { OrganizationRepository } from '../db/postgres/platform/OrganizationRepository.js';
import { HttpError } from './errorHandler.js';

// Org sintética para modo memory (single-tenant legacy)
const MEMORY_ORG = {
  id: CCB_ORG_ID,
  slug: 'ccb',
  name: 'Centro Cultural Banreservas',
  legalName: 'Centro Cultural Banreservas',
  primaryColor: '#1a237e',
  secondaryColor: '#ff6f00',
  codePrefix: 'CCB',
  locale: 'es',
  timezone: 'America/Santo_Domingo',
  plan: 'enterprise',
  status: 'active',
  staffPinHash: null,
  logoUrl: null,
  emailFromAddr: null,
  emailFromName: null,
  emailReplyTo: null,
  customDomain: null,
  customDomainVerifiedAt: null,
  trialEndsAt: null,
  createdAt: null,
  updatedAt: null,
  deletedAt: null,
};

const SUBDOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?)\.(.+)$/;
const CACHE_TTL_MS = 60_000;
const cache = new Map(); // key -> { org, expiresAt }
let _orgRepo = null;

async function getOrgRepo() {
  if (_orgRepo) return _orgRepo;
  if (config.DB_DRIVER !== 'postgres') {
    throw new Error('resolveTenant requiere DB_DRIVER=postgres');
  }
  const inst = await initRepositories();
  _orgRepo = new OrganizationRepository(inst.pool);
  return _orgRepo;
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.org;
}

function cacheSet(key, org) {
  cache.set(key, { org, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateTenantCache(slugOrDomain) {
  if (slugOrDomain) {
    cache.delete(`slug:${slugOrDomain}`);
    cache.delete(`domain:${slugOrDomain}`);
  } else {
    cache.clear();
  }
}

function parseHost(host) {
  if (!host) return { kind: 'unknown' };
  const cleanHost = host.split(':')[0].toLowerCase();
  const rootDomain = config.ROOT_DOMAIN.toLowerCase();

  // Marketing host (root o www)
  if (cleanHost === rootDomain || cleanHost === `www.${rootDomain}`) {
    return { kind: 'marketing' };
  }

  // Subdomain de rootDomain
  if (cleanHost.endsWith(`.${rootDomain}`)) {
    const match = cleanHost.match(SUBDOMAIN_RE);
    if (match && match[2] === rootDomain) {
      const slug = match[1];
      // Subdomains reservados se tratan como marketing
      if (RESERVED_SUBDOMAINS.has(slug)) {
        return { kind: 'reserved', slug };
      }
      return { kind: 'subdomain', slug };
    }
  }

  // Custom domain
  return { kind: 'custom', host: cleanHost };
}

const RESERVED_SUBDOMAINS = new Set([
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

async function resolveDevFallback() {
  const repo = await getOrgRepo();
  return repo.findBySlug('ccb');
}

export async function resolveTenant(req, res, next) {
  try {
    // Legacy: modo memory es single-tenant (CCB hardcoded)
    if (config.DB_DRIVER === 'memory') {
      req.organization = MEMORY_ORG;
      req.organizationId = MEMORY_ORG.id;
      req.tenantSource = 'memory-legacy';
      return next();
    }

    // Dev convenience: en localhost/127.0.0.1 sin subdomain, fallback al CCB
    if (DEV_FALLBACK_HOSTS.has(req.hostname)) {
      const org = await resolveDevFallback();
      if (org) {
        req.organization = org;
        req.organizationId = org.id;
        req.tenantSource = 'dev-fallback';
        return next();
      }
    }

    const parsed = parseHost(req.hostname);

    if (parsed.kind === 'marketing') {
      req.organization = null;
      req.tenantSource = 'marketing';
      return next();
    }
    if (parsed.kind === 'reserved') {
      req.organization = null;
      req.tenantSource = 'reserved';
      return next();
    }

    let key, lookupFn;
    if (parsed.kind === 'subdomain') {
      key = `slug:${parsed.slug}`;
      lookupFn = repo => repo.findBySlug(parsed.slug);
    } else if (parsed.kind === 'custom') {
      key = `domain:${parsed.host}`;
      lookupFn = repo => repo.findByCustomDomain(parsed.host);
    } else {
      return next(new HttpError(404, 'Host no reconocido'));
    }

    let org = cacheGet(key);
    if (!org) {
      const repo = await getOrgRepo();
      org = await lookupFn(repo);
      if (org) cacheSet(key, org);
    }

    if (!org) {
      return next(
        new HttpError(404, 'Esta organización no existe', [
          { hint: `Crea una en https://${config.ROOT_DOMAIN}/signup` },
        ]),
      );
    }
    if (org.status === 'suspended') {
      return next(new HttpError(503, 'Organización suspendida'));
    }

    req.organization = org;
    req.organizationId = org.id;
    req.tenantSource = parsed.kind;
    next();
  } catch (e) {
    next(e);
  }
}
