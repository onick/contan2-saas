// apps/web/lib/branding/public-brand.ts · branding de las pantallas PÚBLICAS del
// tenant (login, recuperar, reset, invitación).
//
// Si el host no resuelve a una organización (o la API pública no responde), NO
// se cae a DEFAULT_BRANDING (nombre y colores del CCB): se muestra una marca
// neutra "contan2" sin logo (Q8-65). Para un tenant conocido el comportamiento
// es el de siempre: tema local + nombre/logo reales de la API pública.

import type { PublicBrandingResponse } from '@contan2/contracts';
import { getLocalBranding } from './config';
import type { BrandingOrg } from './theme';

export const NEUTRAL_BRANDING: BrandingOrg = {
  id: 'neutral',
  slug: 'contan2',
  name: 'contan2',
  logoUrl: null,
  emailLogoUrl: null,
  credentialLogoUrl: null,
  logoScale: 100,
  primaryColor: '#334155',
  secondaryColor: '#64748b',
  sidebarTheme: 'brand',
  status: 'active',
  plan: 'free',
  trialEndsAt: null,
};

export interface PublicBrandView {
  branding: BrandingOrg;
  name: string;
  logoUrl: string | null;
  neutral: boolean;
}

export function resolvePublicBrandView(
  pub: PublicBrandingResponse['organization'] | null,
): PublicBrandView {
  if (!pub) {
    return { branding: NEUTRAL_BRANDING, name: NEUTRAL_BRANDING.name, logoUrl: null, neutral: true };
  }
  return { branding: getLocalBranding(), name: pub.name, logoUrl: pub.logoUrl ?? null, neutral: false };
}
