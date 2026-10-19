import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { AppShell } from '../../../../components/shell/AppShell';
import { Unavailable } from '../../../../components/shell/Unavailable';
import { PuertaStats } from '../../../../components/puerta/PuertaStats';
import { getTenantBranding } from '../../../../lib/branding/tenant';
import { getPuertaStats } from '../../../../lib/api/puerta';
import { PUERTA_ENABLED } from '../../../../lib/shell/nav';
import { DEFAULT_PRESETS } from '../../../../components/ui/arc/date-range-picker/presets';
import { DEFAULT_TZ, todayYmd } from '../../../../components/ui/arc/date-range-picker/ymd';

// Puerta · Reportes y estadísticas propios del módulo (salas permanentes).
// Carga inicial server-side ("Este mes"); los filtros (período/sala/rango)
// re-fetchean vía el proxy. Accesible para el rol 'puerta' (prefijo /app/puerta).
export const metadata: Metadata = {
  title: 'Puerta · Reportes',
  description: 'Estadísticas de visitantes de las salas permanentes',
};
export const dynamic = 'force-dynamic';

export default async function PuertaReportesPage() {
  // Mismo guard de la Puerta: feature oculta salvo donde el flag esté encendido.
  if (!PUERTA_ENABLED) notFound();
  const branding = await getTenantBranding();
  // «Este mes» sobre el hoy de Santo Domingo (no la zona del contenedor).
  const range = DEFAULT_PRESETS.find((p) => p.key === 'mes')!.range(todayYmd(DEFAULT_TZ));
  const data = await getPuertaStats(range.from, range.to);

  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Puerta" activeKey="puerta">
      <div className="mx-auto w-full max-w-[1600px]">{children}</div>
    </AppShell>
  );

  if (!data) {
    return shell(<Unavailable inline title="Reportes no disponibles" description="No pudimos calcular las estadísticas de la Puerta. Reintenta en unos segundos." />);
  }

  return shell(<PuertaStats initial={data} initialRange={range} />);
}
