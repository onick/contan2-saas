import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BarChart3 } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { SectionHeader, cn, focusRing } from '../../../components/ui';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { PuertaBoard } from '../../../components/puerta/PuertaBoard';
import { PUERTA_ENABLED } from '../../../lib/shell/nav';

export const metadata: Metadata = {
  title: 'Contan2 v2 · Puerta',
  description: 'Registro de entrada de las salas permanentes',
};
export const dynamic = 'force-dynamic';

export default async function PuertaPage() {
  // Feature oculta salvo donde el flag esté encendido (staging). En prod → 404.
  if (!PUERTA_ENABLED) notFound();
  const branding = await getTenantBranding();
  return (
    <AppShell branding={branding} title="Puerta" activeKey="puerta">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="app-reveal">
          <SectionHeader
            level={1}
            title="Puerta · Salas permanentes"
            subtitle="Elegí la sala (o ambas) y registrá al visitante. Cada entrada suma a la estadística de esa sala."
            actions={
              <Link href="/app/puerta/reportes" className={cn('inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink hover:bg-surface-container', focusRing)}>
                <BarChart3 size={16} strokeWidth={1.9} aria-hidden="true" /> Reportes y estadísticas
              </Link>
            }
          />
        </div>
        <div className="app-reveal mt-6" style={{ animationDelay: '80ms' }}>
          <PuertaBoard initial={[]} />
        </div>
      </div>
    </AppShell>
  );
}
