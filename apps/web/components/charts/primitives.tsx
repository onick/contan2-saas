'use client';

// components/charts/primitives.tsx · primitivos de gráficos compartidos por los
// dashboards (Reportes, Puerta): delta %, donut interactivo con leyenda, barras
// con hover y línea actual-vs-anterior con tooltip. Los valores animan con
// useDataAnim (data-count / data-bar / data-arc / data-line).

import { useId, useRef, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../ui';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function DeltaPct({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[12px] font-bold text-faint">—</span>;
  const up = pct > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[12px] font-bold', pct === 0 ? 'text-faint' : up ? 'text-success-fg' : 'text-danger-fg')}>
      {pct !== 0 && (up ? <ArrowUp size={12} strokeWidth={2.75} /> : <ArrowDown size={12} strokeWidth={2.75} />)}{Math.abs(pct)}%
    </span>
  );
}

export interface Slice { label: string; count: number; color: string; pc: number; offset: number }
export function buildSlices(items: Array<{ label: string; count: number; color: string }>): Slice[] {
  const sum = items.reduce((a, s) => a + s.count, 0) || 1;
  let cum = 0;
  // Incluye los de count 0 (aparecen en la leyenda como "0 · 0%"; su arco es
  // invisible) para no "perder" categorías sin datos aún.
  return items.map((s) => { const pc = (s.count / sum) * 100; const out = { ...s, pc, offset: 25 - cum }; cum += pc; return out; });
}

// Donut interactivo y autocontenido (gráfico + leyenda con hover compartido).
export function Donut({ slices, centerValue, centerLabel }: { slices: Slice[]; centerValue: number; centerLabel: string }) {
  const [hi, setHi] = useState<number | null>(null);
  const active = hi !== null ? slices[hi] : null;
  return (
    <div className="mt-3 flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-[150px] w-[150px] flex-none sm:h-[184px] sm:w-[184px]">
        <svg viewBox="0 0 42 42" className="h-full w-full">
          <circle cx="21" cy="21" r="15.91549" fill="none" stroke="var(--color-surface-container,#eef0f4)" strokeWidth="6" />
          {slices.map((s, i) => (
            <circle key={s.label} cx="21" cy="21" r="15.91549" fill="none" stroke={s.color}
              data-arc={s.pc.toFixed(3)} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
              style={{ strokeDasharray: `${s.pc} ${100 - s.pc}`, strokeDashoffset: s.offset, strokeWidth: hi === i ? 7.6 : 6, opacity: hi === null || hi === i || active?.pc === 0 ? 1 : 0.4, cursor: 'pointer', transition: 'stroke-width .15s, opacity .15s' }} />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          {active ? (
            <div className="px-4">
              <div className="text-[24px] font-extrabold leading-none tabular-nums" style={{ color: active.color }}>{fmt(active.count)}</div>
              <div className="mt-1 text-[10.5px] font-semibold leading-tight text-ink">{active.label}</div>
              <div className="text-[10px] text-faint tabular-nums">{Math.round(active.pc)}%</div>
            </div>
          ) : (
            <div>
              <div className="text-[26px] font-extrabold leading-none tabular-nums text-ink"><span data-count={centerValue}>{fmt(centerValue)}</span></div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-faint">{centerLabel}</div>
            </div>
          )}
        </div>
      </div>
      <ul className="w-full flex-1 space-y-2">
        {slices.map((s, i) => (
          <li key={s.label} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
            className={cn('flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 text-[13px] transition-colors', hi === i && 'bg-surface-container', hi !== null && hi !== i && 'opacity-50')}>
            <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: s.color }} />
            <span className="truncate text-ink/80">{s.label}</span>
            <span className="ml-auto font-bold tabular-nums text-ink">{fmt(s.count)}</span>
            <span className="w-10 text-right text-faint tabular-nums">({Math.round(s.pc)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Bars({ items, max, color, empty }: { items: Array<{ label: string; value: number }>; max: number; color: string; empty: string }) {
  const [hi, setHi] = useState<number | null>(null);
  if (items.length === 0 || items.every((i) => i.value === 0)) return <p className="mt-6 text-[13px] text-muted">{empty}</p>;
  const peak = items.reduce((b, it, i) => (it.value > items[b]!.value ? i : b), 0);
  return (
    <div className="mt-3">
      <div className="flex h-[136px] items-end gap-2.5 border-b border-line">
        {items.map((it, k) => {
          const h = (it.value / max) * 100;
          const dim = hi !== null && hi !== k;
          const lit = hi === k || (hi === null && k === peak);
          return (
            <div key={k} onMouseEnter={() => setHi(k)} onMouseLeave={() => setHi(null)}
              className="flex h-full flex-1 cursor-default flex-col items-center justify-end gap-1.5">
              <span className={cn('text-[10.5px] font-bold tabular-nums transition-colors', it.value === 0 ? 'opacity-0' : hi === k ? 'text-ink' : 'text-faint')}>{fmt(it.value)}</span>
              <i className="w-full max-w-[30px] rounded-t-md transition-all duration-150" data-bar="h" data-val={h}
                style={{ height: `${h}%`, minHeight: it.value > 0 ? 5 : 0, background: color, opacity: dim ? 0.4 : lit ? 1 : 0.78 }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2.5">
        {items.map((it, k) => (<span key={k} className={cn('flex-1 text-center text-[10.5px] transition-colors', hi === k ? 'font-bold text-ink' : 'text-faint')}>{it.label}</span>))}
      </div>
    </div>
  );
}

// Línea "este período vs anterior" con tooltip. `tooltipExtra` agrega filas al
// tooltip (p. ej. visitantes/actividades en Reportes) sin acoplar el gráfico.
export interface DailyPoint { label: string; current: number; previous: number }
export function LineChart({ daily, color = '#e65100', currentLabel = 'Asistencias', tooltipExtra }: {
  daily: DailyPoint[]; color?: string; currentLabel?: string;
  tooltipExtra?: (i: number) => Array<{ c: string; l: string; v: number }>;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gradId = useId();
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
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.20" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient>
        <path d={area} fill={`url(#${gradId})`} />
        <path data-line d={line('previous')} fill="none" stroke="#c7ccd4" strokeWidth="2" strokeDasharray="4 4" />
        <path data-line d={line('current')} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        {hi !== null && (
          <g>
            <line x1={x(hi)} y1={pad.t} x2={x(hi)} y2={H - pad.b} stroke={color} strokeOpacity="0.35" strokeDasharray="3 3" />
            <circle cx={x(hi)} cy={y(daily[hi]!.previous)} r="3.5" fill="#fff" stroke="#c7ccd4" strokeWidth="2" />
            <circle cx={x(hi)} cy={y(daily[hi]!.current)} r="4.5" fill="#fff" stroke={color} strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {hd && hi !== null && (
        <div className="pointer-events-none absolute top-1 z-10 min-w-[168px] -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-lg" style={{ left: `${tipLeft}%` }}>
          <p className="mb-1.5 text-[11px] font-bold text-faint">{hd.label}</p>
          {[{ c: color, l: currentLabel, v: hd.current }, ...(tooltipExtra?.(hi) ?? [])].map((r) => (
            <div key={r.l} className="flex items-center gap-2 py-0.5"><span className="h-2 w-2 flex-none rounded-full" style={{ background: r.c }} /><span className="text-ink/80">{r.l}</span><span className="ml-auto font-extrabold tabular-nums text-ink">{fmt(r.v)}</span></div>
          ))}
          <div className="mt-1 flex items-center gap-2 border-t border-line pt-1.5 text-faint"><span className="h-2 w-2 flex-none rounded-full" style={{ background: '#c7ccd4' }} /><span>Período anterior</span><span className="ml-auto font-bold tabular-nums">{fmt(hd.previous)}</span></div>
        </div>
      )}
    </div>
  );
}
