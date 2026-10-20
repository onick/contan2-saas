'use client';

// components/puerta/PuertaStats.tsx · reportes y estadísticas PROPIOS del
// módulo Puerta (salas permanentes). Todo en PERSONAS (1 + acompañantes/
// alumnos): KPIs con delta vs el período anterior de igual duración, evolución
// diaria, distribución por sala / composición del público, grupos que nos
// visitaron, resultado de la agenda VR y personas por hora / día. Server
// fetchea el período inicial; los filtros re-fetchean vía el BFF same-origin.
// Reusa los primitivos de gráficos del dashboard de Reportes (charts/*).

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Users, DoorOpen, UserCheck, GraduationCap, Download, ArrowLeft, CalendarClock, Clock,
} from 'lucide-react';
import type { PuertaStatsResponse } from '@contan2/contracts';
import { Card, Chip, cn, focusRing } from '../ui';
import { DeltaPct, buildSlices, Donut, Bars, LineChart } from '../charts/primitives';
import { useDataAnim } from '../charts/useDataAnim';
import { salaColor, salaSeriesColors } from './salaColors';
import { DateRangePicker } from '../ui/arc/date-range-picker/DateRangePicker';
import { SplitButton } from '../ui/arc/split-button/SplitButton';
import { MAX_RANGE_DAYS } from '../reportes/filters';
import { CHART_MAIN, CHART_NEUTRAL, CHART_PREV, CHART_SECONDARY, chartVar } from '../charts/palette';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const COMPOSITION_META: Record<string, { label: string; color: string }> = {
  identificados: { label: 'Identificados', color: chartVar(6) },
  grupos: { label: 'En grupo', color: chartVar(4) },
  anonimos: { label: 'Anónimos', color: CHART_NEUTRAL },
};

const BOOKING_ROWS = [
  { k: 'scheduled', label: 'Agendadas', tone: 'neutral' },
  { k: 'confirmed', label: 'Confirmadas', tone: 'success' },
  { k: 'attended', label: 'Asistieron', tone: 'brand' },
  { k: 'noShow', label: 'No vinieron', tone: 'warning' },
  { k: 'cancelled', label: 'Canceladas', tone: 'danger' },
] as const;

export interface PuertaStatsProps {
  initial: PuertaStatsResponse;
  initialRange: { from: string; to: string };
}

export function PuertaStats({ initial, initialRange }: PuertaStatsProps) {
  const [data, setData] = useState(initial);
  const [periodKey, setPeriodKey] = useState<string | null>('mes');
  const [range, setRange] = useState(initialRange);
  const [sala, setSala] = useState('all');
  const [loading, setLoading] = useState(false);
  // PUE-A10: si el refresco falla, las cifras en pantalla siguen siendo las del
  // período ANTERIOR (data.range). Se marcan como viejas (atenuadas + aviso con
  // Reintentar) en vez de pasar por buenas bajo el filtro nuevo.
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [attempt, setAttempt] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // Re-fetch al cambiar filtros (salta el primer render: ya tenemos `initial`).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    let cancel = false;
    setLoading(true);
    setFailed(false);
    const p = new URLSearchParams({ from: range.from, to: range.to });
    if (sala !== 'all') p.set('sala', sala);
    fetch(`/app/puerta/api/stats?${p.toString()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancel) return;
        if (j && j.kpis) { setData(j as PuertaStatsResponse); setUpdatedAt(new Date()); }
        else setFailed(true);
      })
      .catch(() => { if (!cancel) setFailed(true); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [range, sala, attempt]);

  function pickRange(r: { from: string; to: string }, key: string | null) { setPeriodKey(key); setRange(r); }

  useDataAnim(rootRef, data);

  // ── derivados de presentación ──────────────────────────────────────────────
  const k = data.kpis, pr = data.prev, dl = data.deltas;
  const kpis = [
    { label: 'Personas', value: k.people, prev: pr.people, delta: dl.people, tint: 'bg-brand/10 text-brand-text', Icon: Users },
    { label: 'Entradas registradas', value: k.entries, prev: pr.entries, delta: dl.entries, tint: 'bg-info-soft text-info-text', Icon: DoorOpen },
    { label: 'En grupo', value: k.groupPeople, prev: pr.groupPeople, delta: dl.groupPeople, tint: 'bg-chart-4-soft text-chart-4', Icon: GraduationCap },
    { label: 'Visitantes identificados', value: k.identified, prev: pr.identified, delta: dl.identified, tint: 'bg-success-bg text-success-fg', Icon: UserCheck },
  ];

  const salaColors = salaSeriesColors(data.bySala);
  const salaSlices = buildSlices(data.bySala.map((s, i) => ({ label: s.name, count: s.people, color: salaColors[i]! })));
  const compSlices = buildSlices(data.composition.map((c) => ({
    label: COMPOSITION_META[c.key]?.label ?? c.key, count: c.people, color: COMPOSITION_META[c.key]?.color ?? CHART_NEUTRAL,
  })));

  const groupMax = data.groups[0]?.people || 1;

  // Eje de horas CONTINUO entre la primera y la última con datos.
  const hourItems = (() => {
    if (data.byHour.length === 0) return [] as Array<{ label: string; value: number }>;
    const lo = Math.min(...data.byHour.map((h) => h.hour));
    const hi = Math.max(...data.byHour.map((h) => h.hour));
    const m = new Map(data.byHour.map((h) => [h.hour, h.count]));
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({ label: `${lo + i}h`, value: m.get(lo + i) ?? 0 }));
  })();
  const hourMax = Math.max(1, ...hourItems.map((h) => h.value));
  // Semana completa (las salas abren todos los días): Dom..Sáb con ceros.
  const wdMap = new Map(data.byWeekday.map((w) => [w.weekday, w.count]));
  const wdItems = WEEKDAYS.map((label, i) => ({ label, value: wdMap.get(i) ?? 0 }));
  const wdMax = Math.max(1, ...wdItems.map((w) => w.value));

  const bk = data.bookings;
  const bkTotal = bk.scheduled + bk.confirmed + bk.attended + bk.noShow + bk.cancelled;
  const bkMax = Math.max(1, bk.scheduled, bk.confirmed, bk.attended, bk.noShow, bk.cancelled);

  const exportQs = (() => {
    const p = new URLSearchParams({ from: range.from, to: range.to });
    if (sala !== 'all') p.set('sala', sala);
    return p.toString();
  })();

  return (
    <div ref={rootRef}>
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-ink sm:text-[30px]">Reportes de la Puerta</h1>
          <p className="mt-1 text-[14px] text-muted">Personas que entraron a las salas permanentes, comparado con el período anterior de igual duración.</p>
        </div>
        <div className="flex flex-none gap-2.5 sm:ml-auto">
          <Link href="/app/puerta" className={cn('inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 md:min-h-11 text-[13px] font-bold text-ink hover:bg-surface-container', focusRing)}>
            <ArrowLeft size={16} strokeWidth={1.9} /> Registro
          </Link>
          <SplitButton
            label="Exportar Excel"
            className="min-h-11 md:min-h-11 [&>*:last-child]:min-w-11"
            href={`/app/puerta/api/export?${exportQs}`}
            icon={Download}
            menuLabel="Más opciones de exportación"
            actions={[{
              label: 'Excel completo', icon: Download,
              href: `/app/puerta/api/export${sala !== 'all' ? `?sala=${sala}` : ''}`,
              hint: 'Todo el histórico, sin rango',
            }]}
          />
        </div>
      </div>

      {/* filtros: períodos + salas + rango */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <DateRangePicker className="min-h-11 md:min-h-11" label="Período" value={range} presetKey={periodKey} onChange={pickRange} max="today" maxDays={MAX_RANGE_DAYS} collisionPadding={{ top: 8, left: 8, right: 8, bottom: 84 }} />
        <span className="mx-0.5 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
        <button type="button" onClick={() => setSala('all')}
          className={cn('inline-flex min-h-11 items-center rounded-full px-4 text-[12.5px] font-semibold transition-colors', focusRing, sala === 'all' ? 'bg-ink text-white' : 'border border-line bg-surface text-muted hover:bg-surface-container')}>
          Ambas salas
        </button>
        {data.salas.map((s) => (
          <button key={s.id} type="button" onClick={() => setSala(s.id)}
            className={cn('inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[12.5px] font-semibold transition-colors', focusRing, sala === s.id ? 'bg-ink text-white' : 'border border-line bg-surface text-muted hover:bg-surface-container')}>
            <span className="h-2 w-2 flex-none rounded-full" style={{ background: salaColor(s.kind).c }} aria-hidden="true" /> {s.name}
          </button>
        ))}
      </div>

      {/* Aviso de truncado (REP-A25): el Excel tiene una cota de filas y no corta en silencio. */}
      {data.exportRowCap && data.kpis.entries > data.exportRowCap ? (
        <p role="status" className="mt-4 rounded-lg bg-warning-bg px-3 py-2 text-[12.5px] font-medium text-warning-fg">
          Este período tiene {fmt(data.kpis.entries)} entradas y el Excel incluye como máximo las primeras {fmt(data.exportRowCap)}.
          Acota el rango de fechas para descargarlas todas; el archivo también lo avisa en su última fila.
        </p>
      ) : null}

      {failed ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-warning-bg px-3 py-2 text-[12.5px] font-medium text-warning-fg">
          <span>
            No pudimos actualizar las cifras. Lo que ves son los datos de las{' '}
            {updatedAt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })}
            {' '}del período {data.range.from} a {data.range.to}.
          </span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}
            className={cn('inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 text-[12.5px] font-bold text-ink hover:bg-surface-container', focusRing)}>
            Reintentar
          </button>
        </div>
      ) : null}

      <div className={cn('transition-opacity', (loading || failed) && 'opacity-50')}>
        {/* KPIs */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kp) => (
            <Card key={kp.label} padding="md" className="relative flex items-start gap-3.5">
              <div className="absolute right-4 top-4 flex flex-col items-end gap-0.5">
                <DeltaPct pct={kp.delta} />
                <span className="text-[10px] text-faint tabular-nums">{fmt(kp.prev)} antes</span>
              </div>
              <span className={cn('grid h-11 w-11 flex-none place-items-center rounded-xl', kp.tint)}><kp.Icon size={21} strokeWidth={1.9} /></span>
              <div className="min-w-0 pr-16">
                <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-faint">{kp.label}</span>
                <p className="mt-1 text-[30px] font-extrabold leading-none tracking-tight text-ink tabular-nums"><span data-count={kp.value}>{fmt(kp.value)}</span></p>
              </div>
            </Card>
          ))}
        </div>

        {/* evolución + por sala */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Evolución de personas</h2>
            <div className="mt-1.5 flex gap-5 text-[12px] text-muted">
              <span><i className="mr-1.5 inline-block h-[3px] w-3.5 rounded-sm align-middle" style={{ background: CHART_MAIN }} />Este período ({range.from} – {range.to})</span>
              <span><i className="mr-1.5 inline-block h-[3px] w-3.5 rounded-sm align-middle" style={{ background: CHART_PREV }} />Período anterior ({data.prevRange.from} – {data.prevRange.to})</span>
            </div>
            <LineChart daily={data.daily} currentLabel="Personas" />
          </Card>
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Personas por sala</h2>
            <p className="text-[12px] text-muted">Comparativa entre salas en el período (sin filtro de sala).</p>
            {data.bySala.every((s) => s.people === 0) ? (
              <p className="mt-6 text-[13px] text-muted">Sin visitantes en el período.</p>
            ) : (
              <Donut slices={salaSlices} centerValue={data.bySala.reduce((a, s) => a + s.people, 0)} centerLabel="Personas" />
            )}
          </Card>
        </div>

        {/* grupos + composición */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Grupos que nos visitaron</h2>
            <p className="text-[12px] text-muted">Colegios, grupos comunitarios y empresas del período, por personas.</p>
            {data.groups.length === 0 ? <p className="mt-5 text-[13px] text-muted">Sin visitas de grupos en el período.</p> : (
              <div className="mt-3">
                {data.groups.map((g, i) => (
                  <div key={`${g.label}-${i}`} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                    <span className="grid h-5 w-5 flex-none place-items-center rounded-md bg-chart-4-soft text-[11px] font-extrabold text-chart-4">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold leading-tight text-ink">
                        {g.label} <span className="font-normal text-faint">· {g.kind ?? 'Colegio'}</span>
                      </p>
                      <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-surface-container"><i className="block h-full rounded-full" data-bar="w" data-val={(g.people / groupMax) * 100} style={{ width: `${(g.people / groupMax) * 100}%`, background: chartVar(4) }} /></div>
                    </div>
                    <div className="w-14 text-right text-[11px] text-faint tabular-nums">{g.visits} {g.visits === 1 ? 'visita' : 'visitas'}</div>
                    <div className="text-right"><div className="text-[14px] font-extrabold tabular-nums text-ink" data-count={g.people}>{fmt(g.people)}</div><div className="text-[10px] text-faint">personas</div></div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Composición del público</h2>
            {k.people === 0 ? <p className="mt-6 text-[13px] text-muted">Sin visitantes en el período.</p> : (
              <Donut slices={compSlices} centerValue={k.people} centerLabel="Personas" />
            )}
          </Card>
        </div>

        {/* agenda VR + por hora + por día */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
          <Card padding="lg">
            <h2 className="flex items-center gap-1.5 text-[15.5px] font-bold tracking-tight text-ink"><CalendarClock size={15} strokeWidth={2} className="text-faint" /> Agenda VR · reservas del período</h2>
            {bkTotal === 0 ? <p className="mt-5 text-[13px] text-muted">Sin reservas agendadas en el período.</p> : (
              <>
                <div className="mt-3">
                  {BOOKING_ROWS.map((r) => (
                    <div key={r.k} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
                      <span className="w-28 flex-none"><Chip tone={r.tone} dot>{r.label}</Chip></span>
                      <div className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-surface-container">
                        <i className="block h-full rounded-full" data-bar="w" data-val={(bk[r.k] / bkMax) * 100} style={{ width: `${(bk[r.k] / bkMax) * 100}%`, background: CHART_SECONDARY }} />
                      </div>
                      <span className="w-8 text-right text-[14px] font-extrabold tabular-nums text-ink" data-count={bk[r.k]}>{fmt(bk[r.k])}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
                  <div>
                    <p className="text-[11px] text-muted">Tasa de asistencia</p>
                    <p className="text-[22px] font-extrabold leading-tight tabular-nums text-ink">{bk.attendedPct !== null ? `${bk.attendedPct}%` : '—'}</p>
                    <p className="text-[10.5px] text-faint">de las reservas ya decididas</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Personas esperadas</p>
                    <p className="text-[22px] font-extrabold leading-tight tabular-nums text-ink">{fmt(bk.peopleExpected)}</p>
                    <p className="text-[10.5px] text-faint">reservas no canceladas</p>
                  </div>
                </div>
              </>
            )}
          </Card>
          <Card padding="lg">
            <h2 className="flex items-center gap-1.5 text-[15.5px] font-bold tracking-tight text-ink"><Clock size={15} strokeWidth={2} className="text-faint" /> Personas por hora</h2>
            <Bars items={hourItems} max={hourMax} color={CHART_MAIN} empty="Sin datos por hora todavía." />
          </Card>
          <Card padding="lg">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Personas por día</h2>
            <Bars items={wdItems} max={wdMax} color={CHART_SECONDARY} empty="Sin datos por día todavía." />
          </Card>
        </div>

        <p className="mt-6 text-[12.5px] text-muted">
          El Excel del botón de arriba respeta la sala y el rango elegidos. Para todo el histórico, usa la flecha del botón.
        </p>
      </div>
    </div>
  );
}
