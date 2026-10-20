import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell } from '../../components/shell/AppShell';
import { PERIOD_LABEL } from '../../components/dashboard/Overview';
import { OverviewData } from '../../components/dashboard/OverviewData';
import { NewActivityButton } from '../../components/activities/NewActivityButton';
import { SegmentedControl, Card, Skeleton } from '../../components/ui';
import { DemoBanner } from '../../components/shell/DemoBanner';
import { getTenantBranding } from '../../lib/branding/tenant';
import { isDemoFallbackAllowed } from '../../lib/auth/demo';
import { fecha, hora } from '../../lib/format';
import type { DashboardOverviewResponse } from '@contan2/contracts';

export const metadata: Metadata = { title: 'Inicio' };

export const dynamic = 'force-dynamic';

const PERIOD_ITEMS = (active: DashboardOverviewResponse['period']) =>
  (Object.keys(PERIOD_LABEL) as (keyof typeof PERIOD_LABEL)[]).map((p) => ({
    label: PERIOD_LABEL[p],
    href: p === '30d' ? '/app' : `/app?period=${p}`,
    active: p === active,
  }));

function OverviewSkeleton() {
  const kpi = (big: boolean, i: number) => (
    <Card key={i} padding="md" className={big ? 'min-h-[188px]' : 'min-h-[148px]'}>
      <Skeleton className="h-3 w-28" />
      <Skeleton className={big ? 'mt-4 h-14 w-32' : 'mt-4 h-10 w-20'} />
      <Skeleton className="mt-4 h-5 w-14" />
    </Card>
  );
  return (
    <>
      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{[0, 1].map((i) => kpi(true, i))}</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{[2, 3].map((i) => kpi(false, i))}</div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card padding="lg">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-40 w-full" />
        </Card>
        <Card padding="lg">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-48 w-full" />
        </Card>
      </div>
    </>
  );
}

export default async function TenantAdminDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawPeriod = typeof sp.period === 'string' ? sp.period : '30d';
  const period = rawPeriod in PERIOD_LABEL
    ? (rawPeriod as keyof typeof PERIOD_LABEL)
    : '30d';
  const branding = await getTenantBranding();
  const now = new Date();

  return (
    <AppShell branding={branding} title="Inicio" activeKey="dashboard">
      {isDemoFallbackAllowed() ? <DemoBanner /> : null}

      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-ink">Inicio</h1>
          <p className="mt-0.5 text-sm text-muted">Resumen de {branding.name}</p>
        </div>
        <p className="mt-2 inline-flex items-center gap-2 text-[13px] text-muted">
          <span aria-hidden="true" className="h-1.5 w-1.5 flex-none rounded-full bg-brand" />
          Actualizado {fecha(now)} · {hora(now)}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl variant="tray" label="Período" items={PERIOD_ITEMS(period)} />
        <NewActivityButton />
      </div>

      <Suspense key={period} fallback={<OverviewSkeleton />}>
        <OverviewData period={period} />
      </Suspense>
    </AppShell>
  );
}
