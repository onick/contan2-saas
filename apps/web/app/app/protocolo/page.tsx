import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../../../components/shell/AppShell';
import { Unavailable } from '../../../components/shell/Unavailable';
import { ProtocolDashboard } from '../../../components/protocolo/ProtocolDashboard';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { getProtocolDashboard } from '../../../lib/api/protocol';

// Protocolo · dashboard institucional. Invitados ESPECIALES del centro
// (autoridades, diplomáticos, prensa, patrocinadores, directivos, artistas) con
// KPIs + deltas, stats reales por invitado (última asistencia, eventos del año),
// actividad reciente y próximos eventos. Todo desde protocol-dashboard (datos
// reales); el layout rico + animaciones GSAP viven en el client component.
// AppShell intacto. RBAC real lo arbitra el API (operator → dashboard null).
export const metadata: Metadata = {
  title: 'Protocolo',
  description: 'Invitados especiales del centro: autoridades, prensa, patrocinadores y aliados',
};

export const dynamic = 'force-dynamic';

export default async function ProtocoloPage() {
  const branding = await getTenantBranding();
  const data = await getProtocolDashboard();

  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Protocolo" activeKey="protocolo">
      {children}
    </AppShell>
  );

  if (!data) {
    return shell(
      <Unavailable
        inline
        title="Protocolo no disponible"
        description="No pudimos cargar el directorio de invitados especiales. Si tu rol no tiene acceso a protocolo, pídele a un administrador que te habilite."
      />,
    );
  }

  return shell(<ProtocolDashboard initial={data} />);
}
