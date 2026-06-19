import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../../../components/shell/AppShell';
import { Unavailable } from '../../../components/shell/Unavailable';
import { TeamDashboard } from '../../../components/equipo/TeamDashboard';
import { getLocalBranding } from '../../../lib/branding/config';
import { getAdminGate } from '../../../lib/auth/session';
import { getTeamOverview } from '../../../lib/api/team';

// Mi equipo · dashboard elevado. KPIs reales (overview) + miembros (tarjetas/lista,
// acciones seguras) + actividad reciente (audit) + invitar/pendientes + resumen de
// roles. El árbitro RBAC es api-v2: el overview viene null si el rol no es owner/
// admin → mostramos un estado honesto. AppShell intacto.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Mi equipo',
  description: 'Miembros, roles y permisos de la organización',
};

export const dynamic = 'force-dynamic';

export default async function EquipoPage() {
  const branding = getLocalBranding();
  const gate = await getAdminGate();
  const me = gate.status === 'ok' ? gate.staff : null;
  const overview = await getTeamOverview();

  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Mi equipo" activeKey="equipo">
      <div className="mx-auto w-full max-w-[1600px]">{children}</div>
    </AppShell>
  );

  if (!overview) {
    return shell(
      <Unavailable
        inline
        title="Acceso restringido"
        description="La gestión del equipo es para propietarios y administradores. Si creés que es un error, pedile acceso a un administrador."
      />,
    );
  }

  return shell(
    <TeamDashboard
      initialOverview={overview}
      currentStaffId={me?.id}
      currentRole={me?.role}
      canInviteOwner={me?.role === 'owner'}
    />,
  );
}
