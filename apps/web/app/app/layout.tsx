import type { CSSProperties, ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getLocalBranding } from '../../lib/branding/config';
import { brandingToCssVars } from '../../lib/branding/theme';
import { getAdminGate, sanitizeNext } from '../../lib/auth/session';
import { Unavailable } from '../../components/shell/Unavailable';
import { TrialExpired } from '../../components/shell/TrialExpired';

// Gate AUTORITATIVO del tenant-admin (/app/*). El middleware ya hizo el chequeo
// barato de presencia de cookie; acá validamos de verdad contra api-v2:
//   ok           → renderiza con el branding REAL del tenant.
//   unavailable  → api-v2 caído: estado de indisponibilidad, JAMÁS datos demo.
//   resto        → sesión inválida/expirada/cross-tenant/host desconocido →
//                  redirect a /login?next=<ruta> (la ruta llega vía x-pathname
//                  que inyecta el middleware, y se sanea antes de usarse).
// Dinámico por request (cookies()/fetch).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const gate = await getAdminGate();

  if (gate.status === 'unavailable') {
    // No podemos validar la sesión: mostramos indisponibilidad (no redirigimos
    // a /login porque ese flujo también dependería de api-v2) y NUNCA demo.
    const themeVars = brandingToCssVars(getLocalBranding()) as CSSProperties;
    return (
      <div style={themeVars}>
        <Unavailable />
      </div>
    );
  }

  if (gate.status === 'trial-ended') {
    const themeVars = brandingToCssVars(gate.branding) as CSSProperties;
    return (
      <div style={themeVars}>
        <TrialExpired branding={gate.branding} />
      </div>
    );
  }

  if (gate.status !== 'ok') {
    const path = (await headers()).get('x-pathname');
    redirect(`/login?next=${encodeURIComponent(sanitizeNext(path))}`);
  }

  // Cuenta del departamento de PROTOCOLO (PR-7): su mundo es el módulo
  // Protocolo (+ Mi cuenta). Cualquier otra ruta del admin redirige allá.
  // El RBAC real lo arbitra api-v2 (403 por endpoint); esto es UX.
  if (gate.staff.role === 'protocolo') {
    const path = (await headers()).get('x-pathname') ?? '';
    if (!/^\/app\/(protocolo|cuenta)(\/|$|\?)/.test(path)) redirect('/app/protocolo');
  }

  const themeVars = brandingToCssVars(gate.branding) as CSSProperties;
  return <div style={themeVars}>{children}</div>;
}
