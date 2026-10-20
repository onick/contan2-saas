import type { Metadata } from 'next';
import { AppShell } from '../../../components/shell/AppShell';
import { CheckinConsole } from '../../../components/checkin/CheckinConsole';
import { getTenantBranding } from '../../../lib/branding/tenant';

// Consola de check-in REAL del tenant-admin (Check-in C). Server Component shell +
// island client (CheckinConsole, que también pinta el encabezado: título, "En vivo" y reloj) que cablea métricas/búsqueda/actividades/registro a
// api-v2 vía BFF same-origin. CERO demo.
export const metadata: Metadata = {
  title: 'Check-in',
  description: 'Estación de check-in · registro de asistencias en puerta',
};

export default async function CheckinPage() {
  const branding = await getTenantBranding();
  return (
    <AppShell branding={branding} title="Check-in" activeKey="checkin">
      <CheckinConsole />
    </AppShell>
  );
}
