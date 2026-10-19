'use client';

// Dashboard ejecutivo de Reportes. El server trae el período inicial (period-summary, datos reales); este client
// component maneja el estado de los filtros (período + tipos + ciclos, que gobiernan el dashboard Y las descargas
// del período) y compone las piezas: Header (Asistente + Descargas), Filters, Kpis, Charts y TopActivities.
// Anima con GSAP "de datos" (no oculta contenido). AppShell/sidebar intactos.

import { useEffect, useRef, useState } from 'react';
import { CalendarSearch, X } from 'lucide-react';
import type { PeriodSummaryResponse } from '@contan2/contracts';
import { Button, EmptyState, Skeleton, cn } from '../ui';
import { useDataAnim } from '../charts/useDataAnim';
import { DEFAULT_TZ, formatRangeText, todayYmd } from '../ui/arc/date-range-picker/ymd';
import { defaultReportFilters, filtersToSearch, reportsQuery } from './filters';
import { ReportesHeader } from './ReportesHeader';
import { ReportesFilters } from './ReportesFilters';
import { ReportesKpis } from './ReportesKpis';
import { ByTypeCard, EvolutionCard, VisitorsCard, WhenCard, hasHourData, hasWeekdayData } from './ReportesCharts';
import { TopActivitiesCard } from './ReportesTopActivities';
import { useDownloads } from './useDownloads';
import type { CatItem, CatStatus } from './shared';

export interface ReportesDashboardProps {
  initial: PeriodSummaryResponse;
  initialRange: { from: string; to: string };
  // false → el rol solo LEE reportes (operator/consulta): ve KPIs y gráficas del
  // dashboard (period-summary lo permite a todo staff) pero sin botones de
  // Excel/PDF/CSV ni Asistente, porque generar/exportar es 403 para él en
  // api-v2. La página ya filtra a los roles sin acceso. Por defecto true.
  canExport?: boolean;
  // Filtros que vinieron en la URL (?preset&types&categories), ya validados por la página.
  initialFilters?: { preset: string | null; types: string[]; categories: string[] };
}

export function ReportesDashboard({ initial, initialRange, canExport = true, initialFilters }: ReportesDashboardProps) {
  const [data, setData] = useState(initial);
  const [periodKey, setPeriodKey] = useState<string | null>(initialFilters ? initialFilters.preset : 'mes');
  const [range, setRange] = useState(initialRange);
  const [types, setTypes] = useState<string[]>(initialFilters?.types ?? []);
  const [cats, setCats] = useState<string[]>(initialFilters?.categories ?? []);
  const [catList, setCatList] = useState<CatItem[]>([]);
  const [catStatus, setCatStatus] = useState<CatStatus>('loading');
  const [catAttempt, setCatAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [summaryErr, setSummaryErr] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dl = useDownloads();
  // La página trae el resumen con rango y tipos; los ciclos (categories) solo se aplican acá, así que con ciclos en la URL se pide al montar.
  const first = useRef((initialFilters?.categories.length ?? 0) === 0);
  const urlFirst = useRef(true);

  // Re-fetch al cambiar filtros (salta el primer render: ya tenemos `initial`).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    let cancel = false;
    setLoading(true);
    setSummaryErr(false);
    fetch(`/app/reportes/api/summary?${reportsQuery(range.from, range.to, types, cats)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (cancel) return; if (j && j.kpis) setData(j as PeriodSummaryResponse); else setSummaryErr(true); })
      .catch(() => { if (!cancel) setSummaryErr(true); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [range, types, cats]);

  // Filtros en la URL (compartible y sobrevive al refresco). replaceState: no apila historial ni dispara navegación.
  useEffect(() => {
    if (urlFirst.current) { urlFirst.current = false; return; }
    const qs = filtersToSearch({ range, preset: periodKey, types, categories: cats });
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${qs}`);
  }, [range, periodKey, types, cats]);

  // Ciclos/categorías del tenant (una vez) para el filtro del dashboard y la fila «Un ciclo» de Descargas.
  // Error de carga ≠ lista vacía: si la API falla NO decimos «no hay ciclos».
  useEffect(() => {
    let cancel = false;
    setCatStatus('loading');
    fetch('/app/reportes/api/categories', { cache: 'no-store' })
      .then(async (r) => {
        if (cancel) return;
        if (r.ok) {
          const j = await r.json().catch(() => null);
          if (j && Array.isArray(j.categories)) { setCatList(j.categories as CatItem[]); setCatStatus('ok'); }
          else setCatStatus('error');
        } else setCatStatus(r.status === 403 ? 'forbidden' : 'error');
      })
      .catch(() => { if (!cancel) setCatStatus('error'); });
    return () => { cancel = true; };
  }, [catAttempt]);

  function pickRange(r: { from: string; to: string }, key: string | null) { setPeriodKey(key); setRange(r); }
  function toggleType(v: string) { setTypes((t) => (t.includes(v) ? t.filter((x) => x !== v) : [...t, v])); }
  function toggleCat(v: string) { setCats((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v])); }
  function clearFilters() { setTypes([]); setCats([]); }
  function goThisMonth() {
    const d = defaultReportFilters(todayYmd(DEFAULT_TZ));
    pickRange(d.range, d.preset);
  }

  // Animación GSAP "de datos" compartida (counters/barras/arcos/líneas).
  useDataAnim(rootRef, data);

  const k = data.kpis;
  const isEmpty = k.activities === 0 && k.attendances === 0;
  const hasFilters = types.length > 0 || cats.length > 0;
  // Conteos por tipo del menú: solo con «todos los tipos» (con un filtro puesto, byType ya viene recortado y engañaría).
  const typeCounts = types.length === 0 ? Object.fromEntries(data.byType.map((t) => [t.type, t.attendances])) : undefined;

  const nr = data.newVsReturning;
  const showByType = k.attendances > 0;
  const showVisitors = nr.nuevos + nr.recurrentes > 0;
  const showTop = data.topActivities.length > 0;
  const showWhen = hasHourData(data) || hasWeekdayData(data);
  const pair = (a: boolean, b: boolean) => (a && b ? 'lg:grid-cols-[1.7fr_1fr]' : '');

  return (
    <div ref={rootRef}>
      <ReportesHeader
        canExport={canExport}
        downloads={{ filters: { from: range.from, to: range.to, types, categories: cats }, catList, catStatus, onRetryCats: () => setCatAttempt((n) => n + 1), dl }}
      />

      <ReportesFilters
        range={range} periodKey={periodKey} onPickRange={pickRange}
        types={types} cats={cats} catList={catList} typeCounts={typeCounts}
        onToggleType={toggleType} onToggleCat={toggleCat}
        onClearTypes={() => setTypes([])} onClearCats={() => setCats([])} onClearAll={clearFilters}
      />

      {dl.error ? (
        <div role="alert" className="mt-5 flex items-start gap-3 rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-medium text-danger-fg">
          <span className="min-w-0 flex-1">{dl.error}</span>
          <button type="button" onClick={dl.clearError} aria-label="Cerrar aviso" className="-m-1 grid h-11 w-11 flex-none place-items-center rounded-lg hover:bg-danger-fg/10 sm:h-8 sm:w-8">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {summaryErr ? (
        <p role="alert" className="mt-5 rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-medium text-danger-fg">
          No pudimos actualizar los datos para este filtro; abajo se siguen viendo las cifras del filtro anterior.
        </p>
      ) : null}

      <div aria-busy={loading} className={cn('transition-opacity', loading && 'opacity-60')}>
        <ReportesKpis data={data} loading={loading} />

        {isEmpty && loading ? (
          <Skeleton className="mt-4 h-64 w-full rounded-card" />
        ) : isEmpty ? (
          <EmptyState
            className="mt-4"
            icon={CalendarSearch}
            title={`Sin actividad entre ${formatRangeText(range)}`}
            description={hasFilters ? 'Prueba con otro período o quita los filtros de tipo y ciclo.' : 'Prueba con otro período para ver cómo va el centro.'}
            action={(
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={goThisMonth}>Ver este mes</Button>
                {hasFilters ? <Button variant="secondary" onClick={clearFilters}>Quitar filtros</Button> : null}
              </div>
            )}
          />
        ) : (
          <>
            {/* evolución + por tipo */}
            <div className={cn('mt-4 grid grid-cols-1 gap-4', pair(true, showByType))}>
              <EvolutionCard data={data} range={range} />
              {showByType ? <ByTypeCard data={data} /> : null}
            </div>

            {/* actividades destacadas + visitantes */}
            {showTop || showVisitors ? (
              <div className={cn('mt-4 grid grid-cols-1 gap-4', pair(showTop, showVisitors))}>
                {showTop ? <TopActivitiesCard data={data} canExport={canExport} dl={dl} /> : null}
                {showVisitors ? <VisitorsCard data={data} /> : null}
              </div>
            ) : null}

            {showWhen ? <div className="mt-4"><WhenCard data={data} /></div> : null}
          </>
        )}
      </div>
    </div>
  );
}

// Los subcomponentes de gráficos (Donut/Bars/LineChart/DeltaPct) viven en
// components/charts/primitives.tsx, compartidos con el dashboard de la Puerta.
