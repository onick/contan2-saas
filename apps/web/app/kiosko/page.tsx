// app/kiosko/page.tsx · Server Component: trae las actividades públicas del
// tenant y decide el MODO. Real → source='api'; si el fetch falla (api caído /
// sin host / dev sin api) cae a demoData con source='demo' (todo-demo, sin
// mezclar). Pasa el modo + datos a la máquina de estados (client). Al consumir
// apiGet (next/headers + no-store) esta ruta es Dynamic (ƒ), lo correcto para
// contenido por-tenant y en vivo.

import { KioskClient } from './KioskClient';
import { getKioskActivities, getPublicBranding } from '../../lib/api/kiosko';
import { KIOSK_ACTIVITIES } from '../../lib/kiosko/demoData';
import { getLocalBranding } from '../../lib/branding/config';

export default async function KioskPage() {
  const local = getLocalBranding();
  const [real, pub] = await Promise.all([getKioskActivities(), getPublicBranding()]);
  const activities = real ?? KIOSK_ACTIVITIES;
  const source = real ? 'api' : 'demo';

  // El kiosko usa el logo VERTICAL del tenant; si no hay, el horizontal; si el
  // branding público falla, el local. Último recurso: el asset estático.
  const logoUrl = pub?.verticalLogoUrl ?? pub?.logoUrl ?? local.logoUrl ?? '/kiosko/logo.png';

  return (
    <KioskClient
      activities={activities}
      source={source}
      brandName={pub?.name ?? local.name}
      logoUrl={logoUrl}
    />
  );
}
