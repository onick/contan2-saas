import type { BrandingOrg } from './theme';

// Fuente de branding LOCAL (provisional). Hoy alimenta el theming desde acá;
// en un PR posterior se reemplaza por GET /api/v2/org/branding. La forma es
// exactamente la del contrato (`OrgBrandingResponse['organization']`), así
// que el swap futuro es type-safe: solo cambia la fuente de datos, no la
// estructura. No hay llamadas de red en este archivo.

// Branding base de contan2 / tenant ancla (ccb). Los colores coinciden con la
// paleta @theme histórica de globals.css.
export const DEFAULT_BRANDING: BrandingOrg = {
  id: 'local-ccb',
  slug: 'ccb',
  name: 'Centro Cultural Banreservas',
  logoUrl: null,
  emailLogoUrl: null,
  credentialLogoUrl: null,
  logoScale: 100,
  primaryColor: '#e65100',
  secondaryColor: '#ff6f00',
  sidebarTheme: 'brand',
  status: 'active',
  plan: 'free',
  trialEndsAt: null,
};

// Mapa local de tenants conocidos. Por ahora solo el ancla; la firma con slug
// existe para que el futuro multi-tenant (host → slug) sea un cambio obvio.
const LOCAL_BRANDING: Record<string, BrandingOrg> = {
  [DEFAULT_BRANDING.slug]: DEFAULT_BRANDING,
};

// Devuelve el branding local del slug pedido, o el default si no se conoce.
// La resolución host → slug es trabajo del wiring real (otro PR); acá la
// selección es estática.
export function getLocalBranding(slug?: string): BrandingOrg {
  if (slug && LOCAL_BRANDING[slug]) return LOCAL_BRANDING[slug];
  return DEFAULT_BRANDING;
}
