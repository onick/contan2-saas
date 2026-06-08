import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Download, CalendarX } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { AttendanceTable } from '../../../components/registros/AttendanceTable';
import { SectionHeader, Button, Card, EmptyState } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { isDemoFallbackAllowed } from '../../../lib/auth/demo';
import { Unavailable } from '../../../components/shell/Unavailable';
import { DemoBanner } from '../../../components/shell/DemoBanner';
import { SearchBar } from '../../../components/admin/SearchBar';
import { Pagination } from '../../../components/admin/Pagination';
import { RegistrosFilters } from '../../../components/admin/RegistrosFilters';
import { getAttendancePage } from '../../../lib/api/attendance';
import { getActivitiesView } from '../../../lib/api/activities';
import {
  parsePage, parsePageSize, parseQ, qForApi, parseActivityId, parseDateParam,
  dayStartIso, dayEndIso, computeOffset, totalPages, patchSearchParams,
  recordToSearchParams, type Raw,
} from '../../../lib/admin/list-params';
import { ATTENDANCE_RECORDS } from '../../../lib/registros/demoData';

// Registros · paginación + búsqueda + filtros (actividad/fechas) SERVER-SIDE.
// Tabla presentacional. Subtítulo = total + tasa reales (API/metrics). API caída
// → Unavailable; nunca demo salvo dev. Fechas inválidas se sacan de la URL; un
// rango invertido se ignora con aviso (no se manda al API → no rompe el render).
export const metadata: Metadata = {
  title: 'Contan2 v2 · Registros',
  description: 'Registros de asistencia a las actividades',
};

export const dynamic = 'force-dynamic';

export default async function RegistrosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, Raw>>;
}) {
  const sp = await searchParams;
  const branding = getLocalBranding();
  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const q = parseQ(sp.q);
  const activityId = parseActivityId(sp.activityId);

  // Fechas: formato inválido → se elimina de la URL (render seguro).
  const fromP = parseDateParam(sp.dateFrom);
  const toP = parseDateParam(sp.dateTo);
  if (fromP.invalid || toP.invalid) {
    const patch: Record<string, string | undefined> = {};
    if (fromP.invalid) patch.dateFrom = undefined;
    if (toP.invalid) patch.dateTo = undefined;
    redirect(`/app/registros?${patchSearchParams(recordToSearchParams(sp), patch)}`);
  }
  // Rango invertido (from > to): NO se manda al API (evita 400 → Unavailable);
  // se avisa y se ignora el filtro de fechas.
  const rangeInverted = Boolean(fromP.value && toP.value && fromP.value > toP.value);
  const apiFrom = !rangeInverted && fromP.value ? dayStartIso(fromP.value) : undefined;
  const apiTo = !rangeInverted && toP.value ? dayEndIso(toP.value) : undefined;

  const [view, acts] = await Promise.all([
    getAttendancePage({
      limit: pageSize,
      offset: computeOffset(page, pageSize),
      q: qForApi(q),
      activityId,
      dateFrom: apiFrom,
      dateTo: apiTo,
    }),
    getActivitiesView(),
  ]);
  const activityOptions = (acts?.activities ?? []).map((a) => ({ id: a.id, name: a.title }));

  // Página fuera de rango (preservando filtros).
  if (view) {
    if (view.total === 0 && page !== 1) {
      redirect(`/app/registros?${patchSearchParams(recordToSearchParams(sp), { page: undefined })}`);
    } else if (view.total > 0 && computeOffset(page, pageSize) >= view.total) {
      const last = totalPages(view.total, pageSize);
      redirect(`/app/registros?${patchSearchParams(recordToSearchParams(sp), { page: String(last) })}`);
    }
  }

  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Registros" activeKey="registros">
      <div className="mx-auto w-full max-w-[1600px]">{children}</div>
    </AppShell>
  );
  const actions = (
    <Button variant="secondary"><Download size={17} strokeWidth={2} aria-hidden="true" /> Exportar</Button>
  );

  if (!view) {
    if (!isDemoFallbackAllowed()) {
      return shell(
        <Unavailable inline title="Registros no disponibles" description="No pudimos cargar las asistencias. Reintentá en unos segundos." />,
      );
    }
    return shell(
      <>
        <DemoBanner />
        <SectionHeader level={1} title="Registros de asistencia" subtitle="Quién asistió a cada actividad" actions={actions} />
        <div className="mt-4"><AttendanceTable records={ATTENDANCE_RECORDS} /></div>
      </>,
    );
  }

  return shell(
    <>
      <SectionHeader
        level={1}
        title="Registros de asistencia"
        subtitle={`${view.total.toLocaleString('en-US')} registros · ${view.tasaPct}% asistencia`}
        actions={actions}
      />

      <Card padding="none" className="mt-6 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <RegistrosFilters activities={activityOptions} />
          <div className="ml-auto min-w-0 flex-1 sm:flex-none">
            <SearchBar label="Buscar por visitante, código o actividad" placeholder="Buscar por visitante, código o actividad…" />
          </div>
        </div>
        {rangeInverted ? (
          <p role="alert" className="mt-3 rounded-lg border border-[#e0b4b4] bg-[#fdf3f3] px-3.5 py-2 text-[13px] font-medium text-[#9b1c1c]">
            El rango de fechas es inválido (desde es posterior a hasta). Ajustá las fechas.
          </p>
        ) : null}
      </Card>

      {view.total === 0 ? (
        <Card padding="lg" className="mt-4">
          <EmptyState
            icon={CalendarX}
            title="Sin registros"
            description={q.trim() || activityId || apiFrom || apiTo ? 'No hay asistencias para estos filtros. Probá ajustarlos.' : 'Aún no hay registros de asistencia.'}
          />
        </Card>
      ) : (
        <div className="mt-4"><AttendanceTable records={view.records} /></div>
      )}

      <Pagination total={view.total} page={page} pageSize={pageSize} />
    </>,
  );
}
