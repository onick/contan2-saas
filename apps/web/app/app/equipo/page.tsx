import type { Metadata } from 'next';
import { AppShell } from '../../../components/shell/AppShell';
import { TeamTable } from '../../../components/equipo/TeamTable';
import { SectionHeader } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';

// Mi equipo REAL: la lista de staff_members se sirve desde api-v2 (/org/team) vía
// BFF. Sin datos demo ni controles inertes; búsqueda/filtros/paginación server-side.
// Las acciones de gestión (invitar/rol/estado) llegan en un PR posterior con RBAC.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Mi equipo',
  description: 'Miembros, roles y permisos de la organización',
};

export default function EquipoPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Mi equipo" activeKey="equipo">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="app-reveal">
          <SectionHeader level={1} title="Mi equipo" subtitle="Quién tiene acceso a la organización y con qué permisos" />
        </div>
        <div className="app-reveal mt-6" style={{ animationDelay: '80ms' }}>
          <TeamTable />
        </div>
      </div>
    </AppShell>
  );
}
