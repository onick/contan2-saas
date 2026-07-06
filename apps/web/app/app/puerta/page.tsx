import type { Metadata } from 'next';
import { AppShell } from '../../../components/shell/AppShell';
import { SectionHeader } from '../../../components/ui';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { PuertaBoard } from '../../../components/puerta/PuertaBoard';

export const metadata: Metadata = {
  title: 'Contan2 v2 · Puerta',
  description: 'Registro de entrada de las salas permanentes',
};
export const dynamic = 'force-dynamic';

export default async function PuertaPage() {
  const branding = await getTenantBranding();
  return (
    <AppShell branding={branding} title="Puerta" activeKey="puerta">
      <div className="mx-auto w-full max-w-[1100px]">
        <div className="app-reveal">
          <SectionHeader level={1} title="Puerta · Salas permanentes" subtitle="Elegí la sala (o ambas) y registrá al visitante. Cada entrada suma a la estadística de esa sala." />
        </div>
        <div className="app-reveal mt-6" style={{ animationDelay: '80ms' }}>
          <PuertaBoard initial={[]} />
        </div>
      </div>
    </AppShell>
  );
}
