import type { Metadata } from 'next';
import { AppShell } from '../../../components/shell/AppShell';
import { CheckinConsole } from '../../../components/checkin/CheckinConsole';
import { SectionHeader, Chip } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';

// Consola de check-in REAL del tenant-admin (Check-in C). Server Component shell +
// island client (CheckinConsole) que cablea métricas/búsqueda/actividades/registro a
// api-v2 vía BFF same-origin. CERO demo.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Check-in',
  description: 'Estación de check-in · registro de asistencias en puerta',
};

export default function CheckinPage() {
  const branding = getLocalBranding();
  return (
    <AppShell branding={branding} title="Check-in" activeKey="checkin">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="app-reveal">
          <SectionHeader
            level={1}
            title="Check-in"
            subtitle="Registrá asistencias en puerta, en tiempo real"
            actions={<Chip tone="success" dot className="uppercase tracking-[0.04em]">En vivo</Chip>}
          />
        </div>
        <CheckinConsole />
      </div>
    </AppShell>
  );
}
