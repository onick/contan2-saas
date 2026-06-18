'use client';

// Dashboard ejecutivo de Reportes. Server fetchea el período inicial (period-summary,
// datos reales); este client component arma KPIs + evolución (línea este vs anterior)
// + distribución por tipo + top + comparación + nuevos/recurrentes + por hora + por
// día, y maneja los filtros (períodos + tipos en dropdown + rango DESDE/HASTA). Anima
// con GSAP "de datos" (no oculta contenido). AppShell/sidebar intactos.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Calendar, Users, User, TrendingUp, Download, FileText, ChevronDown, Filter, ArrowUp, ArrowDown,
  Film, Music, Wrench, Image as ImageIcon, Drama, Presentation, Clock, type LucideIcon,
} from 'lucide-react';
import type { PeriodSummaryResponse } from '@contan2/contracts';
import { Card, cn, focusRing } from '../ui';
import { loadAnim, prefersReducedMotion } from '../../lib/anim';

// Querystring del período (client-safe; el server usa el de lib/api/reports).
function reportsQuery(from: string, to: string, types?: string[]): string {
  const p = new URLSearchParams({ from, to });
  if (types && types.length) p.set('types', types.join(','));
  return p.toString();
}

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const TYPE_OPTIONS: Array<{ v: string; l: string }> = [
  { v: 'concierto', l: 'Concierto' }, { v: 'cine', l: 'Cine' }, { v: 'taller', l: 'Taller' },
  { v: 'exposicion', l: 'Exposición' }, { v: 'teatro', l: 'Teatro' }, { v: 'conferencia', l: 'Conferencia' }, { v: 'otro', l: 'Otro' },
];
const TYPE_COLOR: Record<string, string> = {
  cine: '#e65100', concierto: '#14b8a6', taller: '#8b5cf6', exposicion: '#10b981', teatro: '#ec4899', conferencia: '#3b6fe0', otro: '#94a3b8',
};
const TYPE_ICON: Record<string, LucideIcon> = {
  cine: Film, concierto: Music, taller: Wrench, exposicion: ImageIcon, teatro: Drama, conferencia: Presentation,
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

// ── chips/helpers de presentación ─────────────────────────────────────────
function DeltaPct({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[12px] font-bold text-faint">—</span>;
  const up = pct > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[12px] font-bold', pct === 0 ? 'text-faint' : up ? 'text-success-fg' : 'text-danger-fg')}>
      {pct !== 0 && (up ? <ArrowUp size={12} strokeWidth={2.75} /> : <ArrowDown size={12} strokeWidth={2.75} />)}{Math.abs(pct)}%
    </span>
  );
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

  // ── animaciones de datos ──────────────────────────────────────────────────
  useIso(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const counters = Array.from(root.querySelectorAll<HTMLElement>('[data-count]'));
    const bars = Array.from(root.querySelectorAll<HTMLElement>('[data-bar]'));
    const arcs = Array.from(root.querySelectorAll<SVGCircleElement>('[data-arc]'));
    const lines = Array.from(root.querySelectorAll<SVGPathElement>('[data-line]'));
    counters.forEach((el) => { el.textContent = '0'; });
    bars.forEach((el) => { el.style[el.dataset.bar === 'h' ? 'height' : 'width'] = '0%'; });
    arcs.forEach((el) => { el.style.strokeDasharray = '0 100'; });
    const settle = () => {
      counters.forEach((el) => { el.textContent = fmt(Number(el.dataset.count)); });
      bars.forEach((el) => { el.style[el.dataset.bar === 'h' ? 'height' : 'width'] = (el.dataset.val ?? '0') + '%'; });
      arcs.forEach((el) => { el.style.strokeDasharray = `${el.dataset.arc} ${100 - Number(el.dataset.arc)}`; });
      lines.forEach((p) => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; });
    };
    let cancelled = false; let ctx: { revert: () => void } | undefined;
    const watchdog = window.setTimeout(settle, 1600);
    void loadAnim().then((api) => {
      if (cancelled) return; window.clearTimeout(watchdog);
      if (!api || !rootRef.current) { settle(); return; }
      const { gsap } = api;
      ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
        counters.forEach((el, i) => { const o = { v: 0 }; tl.to(o, { v: Number(el.dataset.count), duration: 1.0, onUpdate: () => { el.textContent = fmt(o.v); } }, Math.min(0.4, i * 0.03)); });
        lines.forEach((p) => { const L = p.getTotalLength(); p.style.strokeDasharray = String(L); p.style.strokeDashoffset = String(L); tl.to(p, { strokeDashoffset: 0, duration: 1.0, ease: 'power2.inOut' }, 0.1); });
        arcs.forEach((c, i) => { const o = { v: 0 }; const pc = Number(c.dataset.arc); tl.to(o, { v: pc, duration: 0.55, ease: 'power2.out', onUpdate: () => { c.style.strokeDasharray = `${o.v} ${100 - o.v}`; } }, 0.2 + i * 0.1); });
        bars.forEach((b, i) => { const prop = b.dataset.bar === 'h' ? 'height' : 'width'; tl.to(b, { [prop]: (b.dataset.val ?? '0') + '%', duration: 0.6, ease: 'power2.out' }, 0.3 + i * 0.04); });
      }, root);
    });
    return () => { cancelled = true; window.clearTimeout(watchdog); ctx?.revert(); settle(); };
  }, [data]);

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
  const typeSlices = buildSlices(data.byType.filter((t) => t.attendances > 0).map((t) => ({ label: t.label, count: t.attendances, color: TYPE_COLOR[t.type] ?? '#94a3b8' })));
  const nr = data.newVsReturning;
  const nrSlices = buildSlices([{ label: 'Nuevos', count: nr.nuevos, color: '#e65100' }, { label: 'Recurrentes', count: nr.recurrentes, color: '#9fd8cf' }]);
  const topMax = data.topActivities[0]?.attendances || 1;
  const [selAct, setSelAct] = useState(0);
  const sel = data.topActivities[Math.min(selAct, Math.max(0, data.topActivities.length - 1))];
  const hourMax = Math.max(1, ...data.byHour.map((h) => h.count));
  const wdMax = Math.max(1, ...data.byWeekday.map((w) => w.count));

  return (
    <div ref={rootRef}>
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-ink sm:text-[30px]">Reportes</h1>
          <p className="mt-1 text-[14px] text-muted">Resumen ejecutivo con comparación contra el período anterior.</p>
        </div>
        <div className="flex flex-none gap-2.5 sm:ml-auto">
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
        <div className="ml-auto flex items-center gap-3">
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

      <div className={cn('transition-opacity', loading && 'opacity-50')}>
        {/* KPIs (ícono izquierda, info derecha) */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kp) => (
            <Card key={kp.label} padding="md" className="flex items-start gap-3.5">
              <span className={cn('grid h-11 w-11 flex-none place-items-center rounded-xl', kp.tint)}><kp.Icon size={21} strokeWidth={1.9} /></span>
              <div className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-faint">{kp.label}</span>
                <p className="mt-1 text-[30px] font-extrabold leading-none tracking-tight text-ink tabular-nums"><span data-count={kp.value}>{fmt(kp.value)}</span>{kp.suffix}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11.5px]">
                  <DeltaPct pct={kp.delta} />
                  <span className="text-faint">· {fmt(kp.prev)}{kp.suffix ?? ''} antes</span>
                </p>
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
            <LineChart daily={data.daily} />
          </Card>
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Distribución por tipo de actividad</h2>
            {typeSlices.length === 0 ? (
              <p className="mt-6 text-[13px] text-muted">Sin asistencias en el período.</p>
            ) : (
              <div className="mt-3 flex items-center gap-5">
                <Donut slices={typeSlices} centerValue={data.kpis.attendances} centerLabel="Total" />
                <ul className="flex-1 space-y-2">
                  {data.byType.map((t) => (
                    <li key={t.type} className="flex items-center gap-2.5 text-[12.5px]">
                      <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: TYPE_COLOR[t.type] ?? '#94a3b8' }} />
                      <span className="text-ink/80">{t.label}</span>
                      <span className="ml-auto font-bold tabular-nums text-ink">{fmt(t.attendances)}</span>
                      <span className="w-10 text-right text-faint tabular-nums">({t.pct}%)</span>
                    </li>
                  ))}
                </ul>
              </div>
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
                  return (
                    <div key={a.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                      <span className="grid h-5 w-5 flex-none place-items-center rounded-md bg-brand/10 text-[11px] font-extrabold text-brand">{i + 1}</span>
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
              <div className="mt-3 flex items-center gap-5">
                <Donut slices={nrSlices} centerValue={nr.nuevos + nr.recurrentes} centerLabel="Únicos" />
                <ul className="flex-1 space-y-2.5">
                  {nrSlices.map((s) => (
                    <li key={s.label} className="flex items-center gap-2.5 text-[13px]">
                      <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: s.color }} />
                      <span className="text-ink/80">{s.label}</span>
                      <span className="ml-auto font-bold tabular-nums text-ink">{fmt(s.count)}</span>
                      <span className="w-10 text-right text-faint tabular-nums">({Math.round(s.pc)}%)</span>
                    </li>
                  ))}
                </ul>
              </div>
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
                  <div className="rounded-xl border border-line p-3.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-success-bg text-success-fg"><Users size={16} strokeWidth={1.9} /></span>
                    <p className="mt-2 text-[11px] text-muted">Asistencias</p>
                    <p className="text-[22px] font-extrabold tabular-nums text-ink">{fmt(sel?.attendances ?? 0)}</p>
                  </div>
                  <div className="rounded-xl border border-line p-3.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand"><TrendingUp size={16} strokeWidth={1.9} /></span>
                    <p className="mt-2 text-[11px] text-muted">Ocupación</p>
                    <p className="text-[22px] font-extrabold tabular-nums text-ink">{sel?.occupancyPct ?? 0}%</p>
                  </div>
                </div>
              </>
            )}
          </Card>
          <Card padding="lg">
            <h2 className="flex items-center gap-1.5 text-[15.5px] font-bold tracking-tight text-ink"><Clock size={15} strokeWidth={2} className="text-faint" /> Asistencias por hora</h2>
            <Bars items={data.byHour.map((h) => ({ label: `${h.hour}h`, value: h.count }))} max={hourMax} color="#e65100" empty="Sin datos por hora todavía." />
          </Card>
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Asistencias por día</h2>
            <Bars items={data.byWeekday.map((w) => ({ label: WEEKDAYS[w.weekday] ?? '', value: w.count }))} max={wdMax} color="#8fb3ef" empty="Sin datos por día todavía." />
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── subcomponentes de gráficos ─────────────────────────────────────────────
interface Slice { label: string; count: number; color: string; pc: number; offset: number }
function buildSlices(items: Array<{ label: string; count: number; color: string }>): Slice[] {
  const sum = items.reduce((a, s) => a + s.count, 0) || 1;
  let cum = 0;
  return items.filter((s) => s.count > 0).map((s) => { const pc = (s.count / sum) * 100; const out = { ...s, pc, offset: 25 - cum }; cum += pc; return out; });
}

function Donut({ slices, centerValue, centerLabel }: { slices: Slice[]; centerValue: number; centerLabel: string }) {
  return (
    <div className="relative h-[150px] w-[150px] flex-none">
      <svg viewBox="0 0 42 42" className="h-[150px] w-[150px]">
        <circle cx="21" cy="21" r="15.91549" fill="none" stroke="var(--color-surface-container,#eef0f4)" strokeWidth="6" />
        {slices.map((s) => (
          <circle key={s.label} cx="21" cy="21" r="15.91549" fill="none" stroke={s.color} strokeWidth="6" data-arc={s.pc.toFixed(3)} style={{ strokeDasharray: `${s.pc} ${100 - s.pc}`, strokeDashoffset: s.offset }} />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[22px] font-extrabold leading-none tabular-nums text-ink"><span data-count={centerValue}>{fmt(centerValue)}</span></div>
          <div className="mt-0.5 text-[9.5px] uppercase tracking-[0.08em] text-faint">{centerLabel}</div>
        </div>
      </div>
    </div>
  );
}

function Bars({ items, max, color, empty }: { items: Array<{ label: string; value: number }>; max: number; color: string; empty: string }) {
  if (items.length === 0 || items.every((i) => i.value === 0)) return <p className="mt-6 text-[13px] text-muted">{empty}</p>;
  return (
    <div className="mt-4 flex h-[130px] items-end gap-2 pt-1.5">
      {items.map((it, k) => (
        <div key={k} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <i className="w-full max-w-[28px] rounded-t-md" data-bar="h" data-val={(it.value / max) * 100} style={{ height: `${(it.value / max) * 100}%`, background: color }} />
          <span className="text-[10px] text-faint">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ daily }: { daily: PeriodSummaryResponse['daily'] }) {
  const [hi, setHi] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  if (daily.length < 2) return <p className="mt-8 text-[13px] text-muted">Período muy corto para una serie.</p>;
  const W = 640, H = 220, pad = { l: 28, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...daily.map((d) => Math.max(d.current, d.previous))) * 1.15;
  const x = (i: number) => pad.l + (i / (daily.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = (key: 'current' | 'previous') => daily.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const area = `${line('current')} L${x(daily.length - 1).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = Array.from(new Set([0, Math.round(max / 4), Math.round(max / 2), Math.round((3 * max) / 4), Math.round(max)])).filter((v) => v <= max);
  const labelIdx = daily.length <= 8 ? daily.map((_, i) => i) : [0, Math.floor(daily.length / 4), Math.floor(daily.length / 2), Math.floor((3 * daily.length) / 4), daily.length - 1];

  function onMove(e: React.MouseEvent) {
    const el = wrapRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    const frac = Math.max(0, Math.min(1, (fx - pad.l) / (W - pad.l - pad.r)));
    setHi(Math.round(frac * (daily.length - 1)));
  }
  const hd = hi !== null ? daily[hi] : null;
  const tipLeft = hi !== null ? Math.max(15, Math.min(85, (x(hi) / W) * 100)) : 0;

  return (
    <div ref={wrapRef} className="relative mt-2" onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 230 }}>
        {ticks.map((v) => (<g key={v}><line x1={pad.l} y1={y(v)} x2={W - pad.r} y2={y(v)} stroke="var(--color-line)" /><text x="2" y={y(v) + 3} className="fill-faint text-[10px]">{v}</text></g>))}
        {labelIdx.map((i) => (<text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-faint text-[10px]">{daily[i]!.label}</text>))}
        <linearGradient id="repArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e65100" stopOpacity="0.20" /><stop offset="1" stopColor="#e65100" stopOpacity="0" /></linearGradient>
        <path d={area} fill="url(#repArea)" />
        <path data-line d={line('previous')} fill="none" stroke="#c7ccd4" strokeWidth="2" strokeDasharray="4 4" />
        <path data-line d={line('current')} fill="none" stroke="#e65100" strokeWidth="2.5" strokeLinecap="round" />
        {hi !== null && (
          <g>
            <line x1={x(hi)} y1={pad.t} x2={x(hi)} y2={H - pad.b} stroke="#e65100" strokeOpacity="0.35" strokeDasharray="3 3" />
            <circle cx={x(hi)} cy={y(daily[hi]!.previous)} r="3.5" fill="#fff" stroke="#c7ccd4" strokeWidth="2" />
            <circle cx={x(hi)} cy={y(daily[hi]!.current)} r="4.5" fill="#fff" stroke="#e65100" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {hd && (
        <div className="pointer-events-none absolute top-1 z-10 min-w-[168px] -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-lg" style={{ left: `${tipLeft}%` }}>
          <p className="mb-1.5 text-[11px] font-bold text-faint">{hd.label}</p>
          {[{ c: '#e65100', l: 'Asistencias', v: hd.current }, { c: '#7c3aed', l: 'Visitantes únicos', v: hd.visitors }, { c: '#1a56b0', l: 'Actividades', v: hd.activities }].map((r) => (
            <div key={r.l} className="flex items-center gap-2 py-0.5"><span className="h-2 w-2 flex-none rounded-full" style={{ background: r.c }} /><span className="text-ink/80">{r.l}</span><span className="ml-auto font-extrabold tabular-nums text-ink">{fmt(r.v)}</span></div>
          ))}
          <div className="mt-1 flex items-center gap-2 border-t border-line pt-1.5 text-faint"><span className="h-2 w-2 flex-none rounded-full" style={{ background: '#c7ccd4' }} /><span>Período anterior</span><span className="ml-auto font-bold tabular-nums">{fmt(hd.previous)}</span></div>
        </div>
      )}
    </div>
  );
}
