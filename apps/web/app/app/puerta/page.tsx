import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '../../../components/shell/AppShell';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { PuertaBoard } from '../../../components/puerta/PuertaBoard';
import { puertaEnabled } from '../../../lib/puerta/flag';

export const metadata: Metadata = {
  title: 'Puerta',
  description: 'Registro de entrada de las salas permanentes',
};
export const dynamic = 'force-dynamic';

export default async function PuertaPage() {
  // Feature oculta salvo donde el flag esté encendido (staging). En prod → 404.
  if (!puertaEnabled()) notFound();
  const branding = await getTenantBranding();
  return (
    <AppShell branding={branding} title="Puerta" activeKey="puerta" sidebarDefault="collapsed">
      {/* El encabezado (título + Reportes + Registrar en ambas salas) lo pinta PuertaBoard: las acciones
          dependen de las salas cargadas y van juntas en la misma fila, como en el resto del admin. */}
      <PuertaBoard initial={[]} />
    </AppShell>
  );
}
