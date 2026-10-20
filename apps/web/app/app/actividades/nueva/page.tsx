import type { Metadata } from 'next';
import { AppShell } from '../../../../components/shell/AppShell';
import { Unavailable } from '../../../../components/shell/Unavailable';
import { ActivityFormHeader } from '../../../../components/activities/ActivityFormHeader';
import { ActivityFormScreen } from '../../../../components/activities/ActivityFormScreen';
import { getTenantBranding } from '../../../../lib/branding/tenant';
import { getAdminGate } from '../../../../lib/auth/session';

export const metadata: Metadata = {
  title: 'Nueva actividad',
  description: 'Crea una actividad del centro cultural',
};

export const dynamic = 'force-dynamic';

// Crear actividad (página completa). Sólo owner/admin escriben (api-v2 es el
// árbitro: el resto recibiría 403 al enviar, así que no se les ofrece el form).
export default async function NuevaActividadPage() {
  const branding = await getTenantBranding();
  const gate = await getAdminGate();
  const canWrite = gate.status === 'ok' && (gate.staff.role === 'owner' || gate.staff.role === 'admin');

  return (
    <AppShell branding={branding} title="Nueva actividad" activeKey="actividades" parent={{ label: 'Actividades', href: '/app/actividades' }}>
      {canWrite ? (
        <>
          <ActivityFormHeader title="Nueva actividad" subtitle="Organiza los detalles y añade una portada para publicar en el centro cultural." />
          <ActivityFormScreen mode="create" />
        </>
      ) : (
        <Unavailable
          inline
          hideRetry
          title="Acceso restringido"
          description="Crear actividades es para propietarios y administradores. Si crees que es un error, pídele acceso a un administrador."
        />
      )}
    </AppShell>
  );
}
