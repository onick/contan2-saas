import type { CSSProperties, ReactNode } from 'react';
import { getLocalBranding } from '../../lib/branding/config';
import { getBranding } from '../../lib/api/branding';
import { brandingToCssVars } from '../../lib/branding/theme';

// Layout del tenant-admin (/app/*). Aplica el branding por-tenant desde UNA
// sola fuente: real (GET /api/v2/org/branding, read-only) si hay sesión; si no,
// local en fallback. brandingToCssVars sobreescribe --color-brand(-accent) en
// un wrapper, re-tematizando todo el subtree (las utilidades bg-brand/text-brand
// resuelven esas vars). Es async (cookies()/fetch) → las rutas /app/* son
// DINÁMICAS; la marketing `/` queda Static (su layout raíz no toca red).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const branding = (await getBranding()) ?? getLocalBranding();
  const themeVars = brandingToCssVars(branding) as CSSProperties;

  return <div style={themeVars}>{children}</div>;
}
