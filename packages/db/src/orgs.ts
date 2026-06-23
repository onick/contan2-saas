// packages/db/src/orgs.ts · lookups read-only de organizations para tenant
// resolution v2. Proyección mínima (branding + status + custom domain).
// deleted_at IS NULL en ambos.

import type { Kysely } from 'kysely';
import type { Database } from './schema.js';
import type { OrgStatus, SidebarStyle, OrgPlan } from './enums.js';

export interface TenantOrg {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  emailLogoUrl: string | null;
  // Logo propio de la credencial / tarjeta de miembro (si null, cae a logoUrl).
  credentialLogoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  sidebarStyle: SidebarStyle;
  status: OrgStatus;
  customDomain: string | null;
  customDomainVerifiedAt: Date | null;
  // Prefijo de códigos de visitante del tenant (ej. 'CCB'). Lo usa el lookup
  // público para resolver códigos cortos `XXXXXX` → `${codePrefix}-XXXXXX`.
  codePrefix: string;
  trialEndsAt: Date | null;
  plan: OrgPlan;
}

const SELECT_COLUMNS = [
  'id',
  'slug',
  'name',
  'logo_url',
  'email_logo_url',
  'credential_logo_url',
  'primary_color',
  'secondary_color',
  'sidebar_style',
  'status',
  'custom_domain',
  'custom_domain_verified_at',
  'code_prefix',
  'trial_ends_at',
  'plan',
] as const;

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  email_logo_url: string | null;
  credential_logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  sidebar_style: SidebarStyle;
  status: OrgStatus;
  custom_domain: string | null;
  custom_domain_verified_at: Date | null;
  code_prefix: string;
  trial_ends_at: Date | null;
  plan: OrgPlan;
}

function toTenantOrg(r: OrgRow): TenantOrg {
  let status = r.status;
  if (
    status === 'active' &&
    r.plan === 'free' &&
    r.trial_ends_at &&
    new Date() > new Date(r.trial_ends_at)
  ) {
    status = 'trial_ended';
  }
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    logoUrl: r.logo_url,
    emailLogoUrl: r.email_logo_url,
    credentialLogoUrl: r.credential_logo_url,
    primaryColor: r.primary_color,
    secondaryColor: r.secondary_color,
    sidebarStyle: r.sidebar_style,
    status,
    customDomain: r.custom_domain,
    customDomainVerifiedAt: r.custom_domain_verified_at,
    codePrefix: r.code_prefix,
    trialEndsAt: r.trial_ends_at ? new Date(r.trial_ends_at) : null,
    plan: r.plan,
  };
}

export async function findOrgBySlug(
  db: Kysely<Database>,
  slug: string,
): Promise<TenantOrg | null> {
  if (!slug) return null;
  const row = await db
    .selectFrom('organizations')
    .select(SELECT_COLUMNS)
    .where('slug', '=', slug)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  return row ? toTenantOrg(row as any) : null;
}

export async function findOrgByCustomDomain(
  db: Kysely<Database>,
  domain: string,
): Promise<TenantOrg | null> {
  if (!domain) return null;
  const row = await db
    .selectFrom('organizations')
    .select(SELECT_COLUMNS)
    .where('custom_domain', '=', domain)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  return row ? toTenantOrg(row as any) : null;
}
