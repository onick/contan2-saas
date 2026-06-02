// app/kiosko/page.tsx · Server Component: trae las actividades públicas del
// tenant y decide el MODO. Real → source='api'; si el fetch falla (api caído /
// sin host / dev sin api) cae a demoData con source='demo' (todo-demo, sin
// mezclar). Pasa el modo + datos a la máquina de estados (client). Al consumir
// apiGet (next/headers + no-store) esta ruta es Dynamic (ƒ), lo correcto para
// contenido por-tenant y en vivo.

import { KioskClient } from './KioskClient';
import { getKioskActivities } from '../../lib/api/kiosko';
import { KIOSK_ACTIVITIES } from '../../lib/kiosko/demoData';
import { getLocalBranding } from '../../lib/branding/config';

export default async function KioskPage() {
  const branding = getLocalBranding();
  const real = await getKioskActivities();
  const activities = real ?? KIOSK_ACTIVITIES;
  const source = real ? 'api' : 'demo';

  return (
    <KioskClient
      activities={activities}
      source={source}
      brandName={branding.name}
      logoUrl={branding.logoUrl ?? '/kiosko/logo.png'}
    />
  );
}
