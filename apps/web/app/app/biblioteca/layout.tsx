import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { AppShell } from '../../../components/shell/AppShell';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { getAdminGate } from '../../../lib/auth/session';
import { BIBLIOTECA_ENABLED } from '../../../lib/shell/nav';

// Layout de /app/biblioteca/**: usa el AppShell estándar (sidebar + topbar del
// admin). Cada página monta el BibliotecaTabsNav (bandeja de pestañas) justo debajo de
// su encabezado. El confinamiento RBAC del rol biblioteca ya lo aplica el layout padre
// app/app/layout.tsx (redirige a /app/biblioteca si intenta ir a otra ruta).
export default async function BibliotecaLayout({ children }: { children: ReactNode }) {
  if (!BIBLIOTECA_ENABLED) notFound();
  const branding = await getTenantBranding();
  const gate = await getAdminGate();
  const role = gate.status === 'ok' || gate.status === 'trial-ended' ? gate.staff.role : null;
  return (
    <AppShell branding={branding} title="Biblioteca" activeKey="biblioteca" role={role}>
      {children}
    </AppShell>
  );
}
