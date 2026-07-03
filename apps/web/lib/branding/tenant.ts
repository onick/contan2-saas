// apps/web/lib/branding/tenant.ts · branding REAL del tenant para el shell admin.
//
// Antes, cada página de /app pasaba getLocalBranding() (estático, slug 'ccb'),
// así que TODOS los tenants veían el lockup y el nombre del CCB en el sidebar
// — solo los colores salían del tenant real. Este helper cierra ese hueco:
// devuelve el branding real resuelto por getAdminGate() (fetch tenant-aware,
// cacheado por request), y cae al local solo si el gate no está 'ok'/trial
// (caso que el layout ya redirige, así que en la práctica siempre hay real).

import { getAdminGate } from '../auth/session';
import { getLocalBranding } from './config';
import type { BrandingOrg } from './theme';

export async function getTenantBranding(): Promise<BrandingOrg> {
  const gate = await getAdminGate();
  return gate.status === 'ok' || gate.status === 'trial-ended'
    ? gate.branding
    : getLocalBranding();
}
