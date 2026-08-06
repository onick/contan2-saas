'use client';

// Dashboard ejecutivo de Reportes. Server fetchea el período inicial (period-summary,
// datos reales); este client component arma KPIs + evolución (línea este vs anterior)
// + distribución por tipo + top + comparación + nuevos/recurrentes + por hora + por
// día, y maneja los filtros (períodos + tipos en dropdown + rango DESDE/HASTA). Anima
// con GSAP "de datos" (no oculta contenido). AppShell/sidebar intactos.

import { useEffect, useRef, useState } from 'react';
import {
  Calendar, Users, User, TrendingUp, Download, FileText, ChevronDown, Filter,
  Film, Music, Wrench, Image as ImageIcon, Drama, Presentation, MessagesSquare, Footprints, BookOpen,
  Clock, Layers, type LucideIcon,
} from 'lucide-react';
import type { PeriodSummaryResponse } from '@contan2/contracts';
import { Card, cn, focusRing } from '../ui';
import { DeltaPct, buildSlices, Donut, Bars, LineChart } from '../charts/primitives';
import { useDataAnim } from '../charts/useDataAnim';
import { ReportsAgent } from './ReportsAgent';

// Querystring del período (client-safe; el server usa el de lib/api/reports).
function reportsQuery(from: string, to: string, types?: string[]): string {
  const p = new URLSearchParams({ from, to });
  if (types && types.length) p.set('types', types.join(','));
  return p.toString();
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const TYPE_OPTIONS: Array<{ v: string; l: string }> = [
  { v: 'concierto', l: 'Concierto' }, { v: 'cine', l: 'Cine' }, { v: 'taller', l: 'Taller' },
  { v: 'exposicion', l: 'Exposición' }, { v: 'teatro', l: 'Teatro' }, { v: 'conferencia', l: 'Conferencia' },
  { v: 'tertulia', l: 'Tertulia' }, { v: 'visita_guiada', l: 'Visita guiada' }, { v: 'cuentacuentos', l: 'Cuenta cuentos' },
  { v: 'otro', l: 'Otro' },
];
const TYPE_COLOR: Record<string, string> = {
  cine: '#e65100', concierto: '#14b8a6', taller: '#8b5cf6', exposicion: '#10b981', teatro: '#ec4899', conferencia: '#3b6fe0',
  tertulia: '#0ea5e9', visita_guiada: '#eab308', cuentacuentos: '#f43f5e', otro: '#94a3b8',
};
const TYPE_ICON: Record<string, LucideIcon> = {
  cine: Film, concierto: Music, taller: Wrench, exposicion: ImageIcon, teatro: Drama, conferencia: Presentation,
  tertulia: MessagesSquare, visita_guiada: Footprints, cuentacuentos: BookOpen,
};
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

type Preset = { key: string; label: string };
const PRESETS: Preset[] = [
  { key: 'mes', label: 'Este mes' }, { key: 'mesPasado', label: 'Mes pasado' },
  { key: '30d', label: 'Últimos 30 días' }, { key: '90d', label: 'Últimos 90 días' }, { key: 'anio', label: 'Este año' },
];
function presetRange(key: string): { from: string; to: string } {
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const today = new Date(y, m, d);
  switch (key) {
    case 'mesPasado': return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case '30d': return { from: ymd(new Date(y, m, d - 29)), to: ymd(today) };
    case '90d': return { from: ymd(new Date(y, m, d - 89)), to: ymd(today) };
    case 'anio': return { from: ymd(new Date(y, 0, 1)), to: ymd(today) };
    default: return { from: ymd(new Date(y, m, 1)), to: ymd(today) };
  }
}

const PALETTE = ['#e65100', '#14b8a6', '#8b5cf6', '#10b981', '#3b6fe0', '#ec4899', '#94a3b8'];

export interface ReportesDashboardProps {
  initial: PeriodSummaryResponse;
  initialRange: { from: string; to: string };
}

export function ReportesDashboard({ initial, initialRange }: ReportesDashboardProps) {
  const [data, setData] = useState(initial);
  const [periodKey, setPeriodKey] = useState('mes');
  const [range, setRange] = useState(initialRange);
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [ddOpen, setDdOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // Re-fetch al cambiar filtros (salta el primer render: ya tenemos `initial`).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    let cancel = false;
    setLoading(true);
    fetch(`/app/reportes/api/summary?${reportsQuery(range.from, range.to, types)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancel && j && j.kpis) setData(j as PeriodSummaryResponse); })
      .catch(() => {})
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [range, types]);

  // Cerrar dropdown al click afuera.
  useEffect(() => {
    if (!ddOpen) return;
    const h = () => setDdOpen(false);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [ddOpen]);

  function pickPreset(key: string) { setPeriodKey(key); setRange(presetRange(key)); }
  function setDate(which: 'from' | 'to', v: string) { if (v) { setPeriodKey('custom'); setRange((r) => ({ ...r, [which]: v })); } }
  function toggleType(v: string) { setTypes((t) => (t.includes(v) ? t.filter((x) => x !== v) : [...t, v])); }

  const typeLabel = types.length === 0 ? 'Todos los tipos' : types.length === 1 ? (TYPE_OPTIONS.find((o) => o.v === types[0])?.l ?? '1 tipo') : `${types.length} tipos`;

  // Animación GSAP "de datos" compartida (counters/barras/arcos/líneas).
  useDataAnim(rootRef, data);

  // ── derivados de presentación ──────────────────────────────────────────────
  const k = data.kpis, dl = data.deltas, pr = data.prev;
  // KPIs con valor anterior incorporado (sin panel "Comparación" aparte).
  const kpis = [
    { label: 'Actividades', value: k.activities, prev: pr.activities, delta: dl.activities, tint: 'bg-[#e8f0fe] text-[#1a56b0]', Icon: Calendar },
    { label: 'Asistencias', value: k.attendances, prev: pr.attendances, delta: dl.attendances, tint: 'bg-success-bg text-success-fg', Icon: Users },
    { label: 'Visitantes únicos', value: k.uniqueVisitors, prev: pr.uniqueVisitors, delta: dl.uniqueVisitors, tint: 'bg-[#f1e9fe] text-[#7c3aed]', Icon: User },
    { label: 'Ocupación promedio', value: k.occupancyPct, prev: pr.occupancyPct, suffix: '%', delta: dl.occupancyPct, tint: 'bg-brand/10 text-brand', Icon: TrendingUp },
  ];
  // donut por tipo
  const typeSlices = buildSlices(data.byType.map((t) => ({ label: t.label, count: t.attendances, color: TYPE_COLOR[t.type] ?? '#94a3b8' })));
  const nr = data.newVsReturning;
  const nrSlices = buildSlices([{ label: 'Nuevos', count: nr.nuevos, color: '#e65100' }, { label: 'Recurrentes', count: nr.recurrentes, color: '#9fd8cf' }]);
  const topMax = data.topActivities[0]?.attendances || 1;
  const [selAct, setSelAct] = useState(0);
  const sel = data.topActivities[Math.min(selAct, Math.max(0, data.topActivities.length - 1))];
  // Eje de horas CONTINUO: rellena las horas sin asistencias entre la primera y
  // la última con datos (en vez de saltarlas) para no falsear la distribución.
  const hourItems = (() => {
    if (data.byHour.length === 0) return [] as Array<{ label: string; value: number }>;
    const lo = Math.min(...data.byHour.map((h) => h.hour));
    const hi = Math.max(...data.byHour.map((h) => h.hour));
    const m = new Map(data.byHour.map((h) => [h.hour, h.count]));
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({ label: `${lo + i}h`, value: m.get(lo + i) ?? 0 }));
  })();
  const hourMax = Math.max(1, ...hourItems.map((h) => h.value));
  const wdItems = data.byWeekday.map((w) => ({ label: WEEKDAYS[w.weekday] ?? '', value: w.count }));
  const wdMax = Math.max(1, ...wdItems.map((w) => w.value));

  return (
    <div ref={rootRef}>
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-ink sm:text-[30px]">Reportes</h1>
          <p className="mt-1 text-[14px] text-muted">Resumen ejecutivo con comparación contra el período anterior.</p>
        </div>
        <div className="flex flex-none flex-wrap gap-2.5 sm:ml-auto">
          <ReportsAgent />
          <a href={`/app/reportes/api/period?kind=xlsx&${reportsQuery(range.from, range.to, types)}`} className={cn('inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink hover:bg-surface-container', focusRing)}>
            <Download size={16} strokeWidth={1.9} /> Exportar Excel
          </a>
          <a href={`/app/reportes/api/period?kind=pdf&${reportsQuery(range.from, range.to, types)}`} className={cn('inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-strong', focusRing)}>
            <FileText size={16} strokeWidth={1.9} /> Descargar PDF
          </a>
        </div>
      </div>

      {/* filtros */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => pickPreset(p.key)}
            className={cn('rounded-full px-4 py-2 text-[12.5px] font-semibold transition-colors', focusRing, periodKey === p.key ? 'bg-brand text-white' : 'border border-line bg-surface text-muted hover:bg-surface-container')}>
            {p.label}
          </button>
        ))}
        {/* dropdown de tipos, alineado con los períodos */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setDdOpen((v) => !v)}
            className={cn('inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12.5px] font-semibold', focusRing, ddOpen || types.length ? 'border-brand text-brand' : 'border-line bg-surface text-muted hover:bg-surface-container')}>
            <Filter size={14} strokeWidth={1.9} /> {typeLabel}
            {types.length > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-extrabold text-white">{types.length}</span>}
            <ChevronDown size={14} strokeWidth={2.25} className={cn('transition-transform', ddOpen && 'rotate-180')} />
          </button>
          {ddOpen && (
            <div className="absolute left-0 top-[calc(100%+7px)] z-20 min-w-[210px] rounded-xl border border-line bg-surface p-1.5 shadow-xl">
              <label className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] hover:bg-surface-container')}>
                <input type="checkbox" checked={types.length === 0} onChange={() => setTypes([])} className="h-4 w-4 accent-brand" /> Todos los tipos
              </label>
              <div className="my-1 h-px bg-line" />
              {TYPE_OPTIONS.map((o) => (
                <label key={o.v} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink hover:bg-surface-container">
                  <input type="checkbox" checked={types.includes(o.v)} onChange={() => toggleType(o.v)} className="h-4 w-4 accent-brand" /> {o.l}
                </label>
              ))}
            </div>
          )}
        </div>
        {/* rango de fechas */}
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Desde</span>
            <input type="date" value={range.from} onChange={(e) => setDate('from', e.target.value)} className={cn('rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink', focusRing)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Hasta</span>
            <input type="date" value={range.to} onChange={(e) => setDate('to', e.target.value)} className={cn('rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink', focusRing)} />
          </label>
        </div>
      </div>

      {/* reporte por ciclo / categoría — usa el período seleccionado arriba */}
      <CategoryReport range={range} />

      {/* registro mensual tabulado en el formato del departamento */}
      <MonthlyRegisterCard />

      <div className={cn('transition-opacity', loading && 'opacity-50')}>
        {/* KPIs (ícono izquierda, info derecha) */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kp) => (
            <Card key={kp.label} padding="md" className="relative flex items-start gap-3.5">
              {/* delta en la esquina superior derecha */}
              <div className="absolute right-4 top-4 flex flex-col items-end gap-0.5">
                <DeltaPct pct={kp.delta} />
                <span className="text-[10px] text-faint tabular-nums">{fmt(kp.prev)}{kp.suffix ?? ''} antes</span>
              </div>
              <span className={cn('grid h-11 w-11 flex-none place-items-center rounded-xl', kp.tint)}><kp.Icon size={21} strokeWidth={1.9} /></span>
              <div className="min-w-0 pr-16">
                <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-faint">{kp.label}</span>
                <p className="mt-1 text-[30px] font-extrabold leading-none tracking-tight text-ink tabular-nums"><span data-count={kp.value}>{fmt(kp.value)}</span>{kp.suffix}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* evolución + distribución por tipo */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Evolución de asistencias</h2>
            <div className="mt-1.5 flex gap-5 text-[12px] text-muted">
              <span><i className="mr-1.5 inline-block h-[3px] w-3.5 rounded-sm align-middle" style={{ background: '#e65100' }} />Este período ({range.from} – {range.to})</span>
              <span><i className="mr-1.5 inline-block h-[3px] w-3.5 rounded-sm align-middle" style={{ background: '#c7ccd4' }} />Período anterior ({data.prevRange.from} – {data.prevRange.to})</span>
            </div>
            <LineChart daily={data.daily} tooltipExtra={(i) => [
              { c: '#7c3aed', l: 'Visitantes únicos', v: data.daily[i]!.visitors },
              { c: '#1a56b0', l: 'Actividades', v: data.daily[i]!.activities },
            ]} />
          </Card>
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Distribución por tipo de actividad</h2>
            {data.kpis.attendances === 0 ? (
              <p className="mt-6 text-[13px] text-muted">Sin asistencias en el período.</p>
            ) : (
              <Donut slices={typeSlices} centerValue={data.kpis.attendances} centerLabel="Total" />
            )}
          </Card>
        </div>

        {/* top + nuevos/recurrentes — mismo grid que Evolución+Distribución (columnas alineadas) */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Top actividades</h2>
            {data.topActivities.length === 0 ? <p className="mt-5 text-[13px] text-muted">Sin actividades en el período.</p> : (
              <div className="mt-3">
                {data.topActivities.slice(0, 5).map((a, i) => {
                  const color = TYPE_COLOR[a.type] ?? PALETTE[i % PALETTE.length];
                  const Ic = TYPE_ICON[a.type] ?? Film;
                  return (
                    <div key={a.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                      <span className="grid h-5 w-5 flex-none place-items-center rounded-md bg-brand/10 text-[11px] font-extrabold text-brand">{i + 1}</span>
                      {/* miniatura: portada de la actividad o fallback al ícono del tipo */}
                      <span className="grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-lg" style={{ background: `${color}1f` }}>
                        {a.imageUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={a.imageUrl} alt="" className="h-full w-full object-cover" />
                          : <Ic size={16} strokeWidth={1.9} style={{ color }} aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold leading-tight text-ink">{a.name}</p>
                        <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-surface-container"><i className="block h-full rounded-full" data-bar="w" data-val={(a.attendances / topMax) * 100} style={{ width: `${(a.attendances / topMax) * 100}%`, background: color }} /></div>
                      </div>
                      <div className="text-right"><div className="text-[14px] font-extrabold tabular-nums text-ink" data-count={a.attendances}>{fmt(a.attendances)}</div><div className="text-[10px] text-faint">asistencias</div></div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Nuevos vs. recurrentes</h2>
            {nr.nuevos + nr.recurrentes === 0 ? <p className="mt-6 text-[13px] text-muted">Sin visitantes en el período.</p> : (
              <Donut slices={nrSlices} centerValue={nr.nuevos + nr.recurrentes} centerLabel="Únicos" />
            )}
          </Card>
        </div>

        {/* informe por actividad + por hora + por día */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Informe por actividad</h2>
            <p className="text-[12px] text-muted">Elegí una actividad para ver su desempeño en el período.</p>
            {data.topActivities.length === 0 ? <p className="mt-5 text-[13px] text-muted">Sin actividades.</p> : (
              <>
                <select value={selAct} onChange={(e) => setSelAct(Number(e.target.value))} className={cn('mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink', focusRing)}>
                  {data.topActivities.map((a, i) => <option key={a.id} value={i}>{a.name}</option>)}
                </select>
                <div className="mt-3.5 grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 rounded-xl border border-line p-3.5">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-success-bg text-success-fg"><Users size={17} strokeWidth={1.9} /></span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted">Asistencias</p>
                      <p className="text-[22px] font-extrabold leading-tight tabular-nums text-ink">{fmt(sel?.attendances ?? 0)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-line p-3.5">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-brand/10 text-brand"><TrendingUp size={17} strokeWidth={1.9} /></span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted">Ocupación</p>
                      <p className="text-[22px] font-extrabold leading-tight tabular-nums text-ink">{sel?.occupancyPct ?? 0}%</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>
          <Card padding="lg">
            <h2 className="flex items-center gap-1.5 text-[15.5px] font-bold tracking-tight text-ink"><Clock size={15} strokeWidth={2} className="text-faint" /> Asistencias por hora</h2>
            <Bars items={hourItems} max={hourMax} color="#e65100" empty="Sin datos por hora todavía." />
          </Card>
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Asistencias por día</h2>
            <Bars items={wdItems} max={wdMax} color="#8fb3ef" empty="Sin datos por día todavía." />
          </Card>
        </div>
      </div>
    </div>
  );
}

// Reporte descargable acotado a un ciclo/categoría dentro del período elegido
// arriba. Trae las categorías del tenant (una vez) y arma los links de descarga
// (xlsx/csv/pdf) contra el mismo endpoint de asistencia-por-actividad, con el
// filtro `category`. Sin categoría = todo el período (equivale al export general).
interface CatItem { category: string; activities: number }
function CategoryReport({ range }: { range: { from: string; to: string } }) {
  const [cats, setCats] = useState<CatItem[] | null>(null);
  const [cat, setCat] = useState('');
  useEffect(() => {
    let cancel = false;
    fetch('/app/reportes/api/categories', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancel) setCats(j && Array.isArray(j.categories) ? (j.categories as CatItem[]) : []); })
      .catch(() => { if (!cancel) setCats([]); });
    return () => { cancel = true; };
  }, []);

  const href = (format: string) => {
    const p = new URLSearchParams({ from: range.from, to: range.to, format });
    if (cat) p.set('category', cat);
    return `/app/reportes/api/attendance?${p.toString()}`;
  };

  return (
    <Card padding="lg" className="mt-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15.5px] font-bold tracking-tight text-ink">
            <Layers size={16} strokeWidth={2} className="text-brand" /> Reporte por ciclo o categoría
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Descargá el detalle de un ciclo (ej.{' '}
            <span className="font-semibold text-ink">5to ciclo de cine dominicano</span>) o categoría, dentro del período elegido arriba
            <span className="whitespace-nowrap font-semibold text-ink"> ({range.from} – {range.to})</span>.
          </p>
        </div>
        <label className="flex flex-none flex-col gap-1 lg:w-72">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Ciclo / categoría</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)} disabled={cats === null}
            className={cn('w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink disabled:opacity-60', focusRing)}>
            <option value="">Todas las categorías</option>
            {(cats ?? []).map((c) => (<option key={c.category} value={c.category}>{c.category} ({c.activities})</option>))}
          </select>
        </label>
      </div>
      {cats !== null && cats.length === 0 ? (
        <p className="mt-3.5 text-[12px] text-muted">Todavía no hay actividades con categoría para agrupar.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2.5">
          <a href={href('xlsx')} className={cn('inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink hover:bg-surface-container', focusRing)}>
            <Download size={16} strokeWidth={1.9} /> Excel
          </a>
          <a href={href('csv')} className={cn('inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink hover:bg-surface-container', focusRing)}>
            <Download size={16} strokeWidth={1.9} /> CSV
          </a>
          <a href={href('pdf')} className={cn('inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-strong', focusRing)}>
            <FileText size={16} strokeWidth={1.9} /> PDF
          </a>
        </div>
      )}
    </Card>
  );
}

// Descarga del "registro mensual" en el formato del departamento (8 columnas +
// Total + Resumen), idéntico en estructura a su Excel pero con datos reales de
// v2. El staff elige mes + año y baja el .xlsx branded.
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function MonthlyRegisterCard() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [year, setYear] = useState(now.getFullYear());
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
  const href = `/app/reportes/api/month?year=${year}&month=${month}`;

  return (
    <Card padding="lg" className="mt-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15.5px] font-bold tracking-tight text-ink">
            <Calendar size={16} strokeWidth={2} className="text-brand" /> Reporte mensual (formato registro)
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Descargá el mes tabulado con las mismas columnas del registro del departamento (No., Fecha, Mes, Semana, Tipo, Programa, Nombre y Asistencia), con Total y resumen. Fechas y asistencia reales del sistema.
          </p>
        </div>
        <div className="flex flex-none flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Mes</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className={cn('rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink', focusRing)}>
              {MESES.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Año</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className={cn('rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink', focusRing)}>
              {years.map((y) => (<option key={y} value={y}>{y}</option>))}
            </select>
          </label>
          <a href={href} className={cn('inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-strong', focusRing)}>
            <Download size={16} strokeWidth={1.9} /> Descargar Excel
          </a>
        </div>
      </div>
    </Card>
  );
}

// Los subcomponentes de gráficos (Donut/Bars/LineChart/DeltaPct) viven en
// components/charts/primitives.tsx, compartidos con el dashboard de la Puerta.
