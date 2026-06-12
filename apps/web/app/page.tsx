import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LandingPro } from '../components/marketing/LandingPro';
import { isMarketingHost } from '../lib/marketing/host';

// Raíz por HOST:
//   marketing (contan2.com / www / root del ROOT_DOMAIN) → landing de la
//   plataforma (rediseño aprobado 2026-06-12, estilo editorial premium).
//   host de tenant (ccb.contan2.com, …) → directo al LOGIN del panel
//   (decisión del usuario: la raíz del tenant es la puerta del equipo).
// Kiosko y scanner viven en sus rutas propias.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (isMarketingHost(host)) return <LandingPro />;
  redirect('/login');
}
