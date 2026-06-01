// apps/web/lib/api/branding.ts · fetcher read-only del branding del tenant.
// La forma de la respuesta (OrgBrandingResponse['organization']) ES BrandingOrg
// → asignación directa, una sola fuente de theme. Devuelve null si falla (sin
// sesión / api-v2 caído) → el layout cae a getLocalBranding().

import { OrgBrandingResponseSchema } from '@contan2/contracts';
import { apiGet } from './client';
import type { BrandingOrg } from '../branding/theme';

export async function getBranding(): Promise<BrandingOrg | null> {
  try {
    const { organization } = await apiGet('/api/v2/org/branding', OrgBrandingResponseSchema);
    return organization;
  } catch {
    return null;
  }
}
