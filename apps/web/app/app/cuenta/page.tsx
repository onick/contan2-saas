import type { Metadata } from 'next';
import { AppShell } from '../../../components/shell/AppShell';
import { SectionHeader } from '../../../components/ui';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { ChangePasswordCard, SessionsCard } from '../../../components/cuenta/AccountClient';

// Mi cuenta (S1): cambio de contraseña + sesiones activas del staff logueado.
export const metadata: Metadata = {
  title: 'Mi cuenta',
  description: 'Seguridad de tu cuenta: contraseña y sesiones',
};

export const dynamic = 'force-dynamic';

export default async function CuentaPage() {
  const branding = await getTenantBranding();
  return (
    <AppShell branding={branding} title="Mi cuenta" activeKey="cuenta">
      {/* Mismo ancho que el resto del admin (1600px); las dos tarjetas van lado a lado
          desde lg para no dejar la página como una columna angosta al centro. */}
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="app-reveal">
          <SectionHeader level={1} title="Mi cuenta" subtitle="Contraseña y sesiones abiertas" />
        </div>
        <div className="app-stagger mt-6 grid items-start gap-5 lg:grid-cols-2">
          <ChangePasswordCard />
          <SessionsCard />
        </div>
      </div>
    </AppShell>
  );
}
