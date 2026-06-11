import type { Metadata } from 'next';
import { AppShell } from '../../../components/shell/AppShell';
import { SectionHeader } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { ChangePasswordCard, SessionsCard } from '../../../components/cuenta/AccountClient';

// Mi cuenta (S1): cambio de contraseña + sesiones activas del staff logueado.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Mi cuenta',
  description: 'Seguridad de tu cuenta: contraseña y sesiones',
};

export const dynamic = 'force-dynamic';

export default function CuentaPage() {
  const branding = getLocalBranding();
  return (
    <AppShell branding={branding} title="Mi cuenta" activeKey="cuenta">
      <div className="mx-auto w-full max-w-[1000px]">
        <div className="app-reveal">
          <SectionHeader level={1} title="Mi cuenta" subtitle="Contraseña y sesiones abiertas" />
        </div>
        <div className="app-stagger mt-6 space-y-5">
          <ChangePasswordCard />
          <SessionsCard />
        </div>
      </div>
    </AppShell>
  );
}
