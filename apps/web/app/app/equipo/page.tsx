import type { Metadata } from 'next';
import { AppShell } from '../../../components/shell/AppShell';
import { TeamTable } from '../../../components/equipo/TeamTable';
import { SectionHeader } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { getAdminGate } from '../../../lib/auth/session';

// Mi equipo REAL: la lista de staff_members se sirve desde api-v2 (/org/team) vía
// BFF, con acciones seguras (rol/estado) gateadas por el staff de la sesión (los
// invariantes RBAC los aplica api-v2). Sin datos demo ni controles inertes.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Mi equipo',
  description: 'Miembros, roles y permisos de la organización',
};

export default async function EquipoPage() {
  const branding = getLocalBranding();
  const gate = await getAdminGate();
  const me = gate.status === 'ok' ? gate.staff : null;

  return (
    <AppShell branding={branding} title="Mi equipo" activeKey="equipo">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="app-reveal">
          <SectionHeader level={1} title="Mi equipo" subtitle="Quién tiene acceso a la organización y con qué permisos" />
        </div>
        <div className="app-reveal mt-6" style={{ animationDelay: '80ms' }}>
          <TeamTable currentStaffId={me?.id} currentRole={me?.role} />
        </div>
      </div>
    </AppShell>
  );
}
