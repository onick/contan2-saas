// app/scanner/page.tsx · Server Component del scanner. Hace el GATE server-side
// (getScannerSession → GET /scanner/me con la cookie firmada) y trae las
// actividades públicas reales del tenant para el selector. Pasa ambos a la
// máquina de estados (client). Las actividades son públicas (mismo slice que el
// kiosko), así que se cargan aunque la sesión aún no exista: el cliente las usa
// recién después del login por PIN. Dynamic (cookie + no-store).

import { ScannerClient } from './ScannerClient';
import { getScannerSession, getScannerActivities } from '../../lib/api/scanner';
import { getLocalBranding } from '../../lib/branding/config';

export const dynamic = 'force-dynamic';

export default async function ScannerPage() {
  const branding = getLocalBranding();
  const [session, activities] = await Promise.all([
    getScannerSession(),
    getScannerActivities(),
  ]);

  return (
    <ScannerClient
      initialAuthed={session !== null}
      activities={activities ?? []}
      brandName={branding.name}
    />
  );
}
