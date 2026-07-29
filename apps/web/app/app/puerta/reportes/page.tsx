import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { AppShell } from '../../../../components/shell/AppShell';
import { Unavailable } from '../../../../components/shell/Unavailable';
import { PuertaStats } from '../../../../components/puerta/PuertaStats';
import { getTenantBranding } from '../../../../lib/branding/tenant';
import { getPuertaStats } from '../../../../lib/api/puerta';
import { PUERTA_ENABLED } from '../../../../lib/shell/nav';

// Puerta · Reportes y estadísticas propios del módulo (salas permanentes).
// Carga inicial server-side ("Este mes"); los filtros (período/sala/rango)
// re-fetchean vía el proxy. Accesible para el rol 'puerta' (prefijo /app/puerta).
export const metadata: Metadata = {
  title: 'Contan2 v2 · Puerta · Reportes',
  description: 'Estadísticas de visitantes de las salas permanentes',
};
export const dynamic = 'force-dynamic';

function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
}

export default async function PuertaReportesPage() {
  // Mismo guard de la Puerta: feature oculta salvo donde el flag esté encendido.
  if (!PUERTA_ENABLED) notFound();
  const branding = await getTenantBranding();
  const range = thisMonthRange();
  const data = await getPuertaStats(range.from, range.to);

  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Puerta" activeKey="puerta">
      <div className="mx-auto w-full max-w-[1500px]">{children}</div>
    </AppShell>
  );

  if (!data) {
    return shell(<Unavailable inline title="Reportes no disponibles" description="No pudimos calcular las estadísticas de la Puerta. Reintentá en unos segundos." />);
  }

  return shell(<PuertaStats initial={data} initialRange={range} />);
}
