import type { Metadata } from 'next';
import { AppShell } from '../../../components/shell/AppShell';
import { SectionHeader } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { PublicAppsHub } from '../../../components/modo-publico/PublicAppsHub';

// Modo público (paridad v1 public-apps-admin, mejorado): hub de las apps de
// lobby — kiosko de auto-registro y scanner de check-in — con URL del tenant,
// copiar/abrir/QR (generado localmente, sin terceros), stat viva del día y la
// guía de setup de la tablet. El nav apuntaba a '#' (control inerte) hasta hoy.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Modo público',
  description: 'Apps de lobby: kiosko de auto-registro y scanner de check-in',
};

export const dynamic = 'force-dynamic';

export default function ModoPublicoPage() {
  const branding = getLocalBranding();
  return (
    <AppShell branding={branding} title="Modo público" activeKey="modo-publico">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="app-reveal">
          <SectionHeader
            level={1}
            title="Modo público"
            subtitle="Las pantallas que el público y el staff usan en la entrada. Configuralas una vez en cada tablet y dejalas corriendo."
          />
        </div>
        <PublicAppsHub />
      </div>
    </AppShell>
  );
}
