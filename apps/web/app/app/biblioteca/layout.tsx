import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { BiblioShell } from '../../../components/biblioteca/BiblioShell';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { getAdminGate } from '../../../lib/auth/session';
import { BIBLIOTECA_ENABLED } from '../../../lib/shell/nav';

// Layout ANIDADO de /app/biblioteca/**: acá la app cambia al sub-shell de la
// Biblioteca (sidebar propio) en vez del AppShell del admin. Misma sesión y
// gate de auth (los aplica el layout padre app/app/layout.tsx). El flag de
// build oculta el módulo completo donde no esté encendido (patrón Puerta).
export default async function BibliotecaLayout({ children }: { children: ReactNode }) {
  if (!BIBLIOTECA_ENABLED) notFound();
  const branding = await getTenantBranding();
  // getAdminGate está cacheado por request (el layout padre ya lo resolvió).
  const gate = await getAdminGate();
  const staff = gate.status === 'ok' || gate.status === 'trial-ended'
    ? { fullName: gate.staff.fullName, role: gate.staff.role }
    : null;
  return <BiblioShell branding={branding} staff={staff}>{children}</BiblioShell>;
}
