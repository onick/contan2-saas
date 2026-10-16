import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getLocalBranding } from '../../lib/branding/config';
import { tenantTitle } from '../../lib/branding/title';
import { brandingToCssVars } from '../../lib/branding/theme';
import { getAdminGate, sanitizeNext } from '../../lib/auth/session';
import { puertaEnabled, puertaRoleRoute } from '../../lib/puerta/flag';
import { Unavailable } from '../../components/shell/Unavailable';
import { TrialExpired } from '../../components/shell/TrialExpired';

// Título (template '%s · tenant') + favicon dinámico desde el logoUrl del tenant (fallback al icon.svg estático).
export async function generateMetadata(): Promise<Metadata> {
  try {
    const gate = await getAdminGate();
    if (gate.status === 'ok' || gate.status === 'trial-ended') {
      return {
        title: tenantTitle(gate.branding.name),
        ...(gate.branding.logoUrl ? { icons: { icon: gate.branding.logoUrl } } : {}),
      };
    }
  } catch { /* silencioso: cae al fallback estático */ }
  return { title: tenantTitle(null) };
}

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

  // Cuentas de departamento confinadas a su superficie (el RBAC real lo arbitra
  // api-v2 con 403 por endpoint; esto es UX). Cualquier ruta fuera del set
  // permitido redirige al módulo principal del rol.
  //   PROTOCOLO (PR-7): módulo Protocolo (+ Mi cuenta).
  //   PUERTA: Puerta (su módulo) + Registros + Protocolo + Reportes + Mi cuenta.
  if (gate.staff.role === 'protocolo') {
    const path = (await headers()).get('x-pathname') ?? '';
    if (!/^\/app\/(protocolo|cuenta)(\/|$|\?)/.test(path)) redirect('/app/protocolo');
  }
  if (gate.staff.role === 'biblioteca') {
    const path = (await headers()).get('x-pathname') ?? '';
    if (!/^\/app\/(biblioteca|cuenta)(\/|$|\?)/.test(path)) redirect('/app/biblioteca');
  }
  if (gate.staff.role === 'puerta') {
    const path = (await headers()).get('x-pathname') ?? '';
    const route = puertaRoleRoute(path, puertaEnabled());
    if (route === 'redirect') redirect('/app/puerta');
    // Módulo apagado en este tenant: estado honesto en vez de un 404 crudo.
    if (route === 'unavailable') {
      return <Unavailable title="Módulo no disponible" description="El módulo Puerta no está habilitado para este centro. Pide a un administrador que lo active." hideRetry />;
    }
  }

  const themeVars = brandingToCssVars(gate.branding) as CSSProperties;
  return <div style={themeVars}>{children}</div>;
}
