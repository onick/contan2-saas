'use client';

// Dashboard de Segmentos · vista rica de audiencia. Server fetchea getSegments()
// y pasa los conteos REALES; este componente arma KPIs + donut de distribución +
// top segmentos + tarjetas de afinidad + ciclos. Animaciones GSAP "de datos"
// (count-up, donut dibujándose, barras creciendo) que NO ocultan contenido →
// visible por defecto, sin flash, accesible (prefers-reduced-motion). El sidebar
// y el AppShell NO se tocan (esto vive dentro del shell existente).

import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  Crown, Activity, Sparkles, Moon, ChevronRight, Heart, BarChart3, Send, Download, Users,
  Film, Music, Wrench, Image as ImageIcon, Drama, Presentation, type LucideIcon,
} from 'lucide-react';
import type { Segment } from '@contan2/contracts';
import { Card, cn, focusRing } from '../ui';
import { loadAnim, prefersReducedMotion } from '../../lib/anim';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// Paleta categórica para los gráficos (no usa el naranja de marca, que queda para
// CTAs). Por TIPO de actividad.
const TYPE_META: Record<string, { label: string; color: string; Icon: LucideIcon }> = {
  cine: { label: 'Cine', color: '#3b6fe0', Icon: Film },
  concierto: { label: 'Conciertos', color: '#8b5cf6', Icon: Music },
  taller: { label: 'Talleres', color: '#14b8a6', Icon: Wrench },
  exposicion: { label: 'Exposiciones', color: '#f59e0b', Icon: ImageIcon },
  teatro: { label: 'Teatro', color: '#ec4899', Icon: Drama },
  conferencia: { label: 'Conferencias', color: '#10b981', Icon: Presentation },
};

// Paleta categórica ordenada (del ejemplo). Se asigna por índice → colores
// variados e intencionales, no el naranja de marca por fallback. "Otros" gris.
const PALETTE = ['#3b6fe0', '#8b5cf6', '#14b8a6', '#f59e0b', '#10b981', '#ec4899', '#6366f1', '#f43f5e'] as const;
const OTROS_COLOR = '#cbd5e1';
const paletteAt = (i: number): string => PALETTE[i % PALETTE.length] as string;
const shortInterest = (label: string): string => label.replace(/^Interesados? en\s+/i, '');

const ENGAGEMENT_META: Record<string, { tint: string; Icon: LucideIcon }> = {
  active: { tint: 'bg-success-bg text-success-fg', Icon: Activity },
  newcomers: { tint: 'bg-[#e8f0fe] text-[#1a56b0]', Icon: Sparkles },
  vip: { tint: 'bg-[#fbf0d8] text-[#8a6116]', Icon: Crown },
  dormant: { tint: 'bg-surface-container text-faint', Icon: Moon },
};

const fmt = (n: number) => n.toLocaleString('en-US');

export interface SegmentsDashboardProps {
  segments: Segment[];
  totalVisitors: number;
}

export function SegmentsDashboard({ segments, totalVisitors }: SegmentsDashboardProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const get = (id: string) => segments.find((s) => s.id === id)?.count ?? 0;
  const afinidad = segments.filter((s) => s.group === 'afinidad');
  const categorias = segments.filter((s) => s.group === 'categorias');

  // Donut "Distribución por interés": por CICLO/CATEGORÍA, que es donde hay
  // espagamiento real (los fans por tipo dependen de un umbral y casi siempre
  // sólo Cine lo cruza). Top 6 categorías + "Otros" (cola). Colores de la paleta.
  const DONUT_MAX = 6;
  const catsSorted = categorias.filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  const donutTop = catsSorted.slice(0, DONUT_MAX).map((s, i) => ({ label: shortInterest(s.label), count: s.count, color: paletteAt(i) }));
  const restCount = catsSorted.slice(DONUT_MAX).reduce((a, s) => a + s.count, 0);
  const donutItems = restCount > 0 ? [...donutTop, { label: 'Otros', count: restCount, color: OTROS_COLOR }] : donutTop;
  const donutSum = donutItems.reduce((a, d) => a + d.count, 0) || 1;
  let cum = 0;
  const slices = donutItems.map((d) => {
    const pc = (d.count / donutSum) * 100;
    const slice = { ...d, pc, offset: 25 - cum };
    cum += pc;
    return slice;
  });

  // Top segmentos: afinidad + categorías por tamaño. % = share sobre la audiencia
  // activa (los intereses se solapan, no suman 100). Color de la paleta por orden.
  const top = [...afinidad, ...categorias]
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const topMax = top[0]?.count ?? 1;

  const kpis: Array<{ id: string; label: string; sub: string; tint: string; Icon: LucideIcon }> = [
    { id: 'active', label: 'Activos recientes', sub: 'Asistieron en los últimos 30 días', tint: 'bg-success-bg text-success-fg', Icon: Activity },
    { id: 'newcomers', label: 'Nuevos visitantes', sub: 'Una sola asistencia registrada', tint: 'bg-[#e8f0fe] text-[#1a56b0]', Icon: Sparkles },
    { id: 'fans-cine', label: 'Fans de Cine', sub: '2 o más asistencias de cine', tint: 'bg-[#e8f0fe] text-[#2456c8]', Icon: Film },
    { id: 'vip', label: 'Visitantes VIP', sub: '10 o más asistencias totales', tint: 'bg-[#fbf0d8] text-[#8a6116]', Icon: Crown },
  ];
  const afinidadCards = (['active', 'newcomers', 'vip', 'dormant'] as const)
    .map((id) => segments.find((s) => s.id === id))
    .filter((s): s is Segment => Boolean(s));

  // ── Animación de datos (no oculta contenido) ──────────────────────────────
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const counters = Array.from(root.querySelectorAll<HTMLElement>('[data-count]'));
    const bars = Array.from(root.querySelectorAll<HTMLElement>('[data-bar]'));
    const arcs = Array.from(root.querySelectorAll<SVGCircleElement>('[data-arc]'));
    // estado inicial "vacío" (natural, no es ocultar contenido)
    counters.forEach((el) => { el.textContent = '0'; });
    bars.forEach((el) => { el.style.width = '0%'; });
    arcs.forEach((el) => { el.style.strokeDasharray = '0 100'; });

    let cancelled = false;
    let ctx: { revert: () => void } | undefined;
    const settle = () => {
      counters.forEach((el) => { el.textContent = fmt(Number(el.dataset.count)); });
      bars.forEach((el) => { el.style.width = (el.dataset.bar ?? '0') + '%'; });
      arcs.forEach((el) => { el.style.strokeDasharray = `${el.dataset.arc} ${100 - Number(el.dataset.arc)}`; });
    };
    const watchdog = window.setTimeout(settle, 1600);

    void loadAnim().then((api) => {
      if (cancelled) return;
      window.clearTimeout(watchdog);
      if (!api || !rootRef.current) { settle(); return; }
      const { gsap } = api;
      ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
        // count-ups
        counters.forEach((el, i) => {
          const o = { v: 0 };
          tl.to(o, { v: Number(el.dataset.count), duration: 1.1, onUpdate: () => { el.textContent = fmt(Math.round(o.v)); } }, i < 4 ? 0.05 * i : 0.3 + 0.02 * i);
        });
        // donut: cada arco crece
        arcs.forEach((c, i) => {
          const o = { v: 0 }; const pc = Number(c.dataset.arc);
          tl.to(o, { v: pc, duration: 0.6, ease: 'power2.out', onUpdate: () => { c.style.strokeDasharray = `${o.v} ${100 - o.v}`; } }, 0.2 + i * 0.12);
        });
        // barras del top
        bars.forEach((b, i) => {
          tl.to(b, { width: (b.dataset.bar ?? '0') + '%', duration: 0.7, ease: 'power2.out' }, 0.3 + i * 0.09);
        });
      }, root);
    });

    return () => { cancelled = true; window.clearTimeout(watchdog); ctx?.revert(); settle(); };
    // re-corre si cambian los datos (navegación/refresh)
  }, [segments, totalVisitors]);

  return (
    <div ref={rootRef}>
      {/* Encabezado + acciones */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold tracking-tight text-ink sm:text-[32px]">Segmentos</h1>
          <p className="mt-1 text-[15px] text-muted">Entiende a tu audiencia y crea experiencias a su medida</p>
          <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
            <Users size={15} strokeWidth={1.9} aria-hidden="true" className="text-faint" />
            <b className="font-bold text-ink tabular-nums" data-count={totalVisitors}>{fmt(totalVisitors)}</b> visitantes activos · afinidad calculada del historial real de asistencias
          </p>
        </div>
        <div className="flex flex-none gap-2.5 sm:ml-auto">
          <button type="button" className={cn('inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13.5px] font-bold text-ink hover:bg-surface-container', focusRing)}>
            <Download size={16} strokeWidth={1.9} aria-hidden="true" /> Exportar segmentos
          </button>
          <button type="button" className={cn('inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-bold text-white hover:bg-brand-strong', focusRing)}>
            <Send size={16} strokeWidth={1.9} aria-hidden="true" /> Crear campaña
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.id} padding="md">
            <div className="flex items-center justify-between">
              <span className={cn('grid h-10 w-10 place-items-center rounded-xl', k.tint)}>
                <k.Icon size={20} strokeWidth={1.9} aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-faint">{k.label}</p>
            <p className="mt-0.5 text-[34px] font-extrabold leading-none tracking-tight text-ink tabular-nums" data-count={get(k.id)}>{fmt(get(k.id))}</p>
            <p className="mt-1.5 text-[12.5px] text-muted">{k.sub}</p>
          </Card>
        ))}
      </div>

      {/* Donut + Top segmentos */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.18fr]">
        <Card padding="lg">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold tracking-tight text-ink">Distribución por interés</h2>
              <p className="text-[12.5px] text-muted">Fans por tipo de actividad (afinidad calculada)</p>
            </div>
          </div>
          {slices.length === 0 ? (
            <p className="mt-6 text-[13px] text-muted">Aún no hay suficientes asistencias para calcular la distribución por interés.</p>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
              <div className="relative h-[200px] w-[200px] flex-none">
                <svg viewBox="0 0 42 42" className="h-[200px] w-[200px] -rotate-0">
                  <circle cx="21" cy="21" r="15.91549" fill="none" stroke="var(--color-surface-container, #eef0f4)" strokeWidth="6" />
                  {slices.map((s) => (
                    <circle
                      key={s.label}
                      cx="21" cy="21" r="15.91549" fill="none"
                      stroke={s.color} strokeWidth="6"
                      data-arc={s.pc.toFixed(3)}
                      style={{ strokeDasharray: `${s.pc} ${100 - s.pc}`, strokeDashoffset: s.offset }}
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="text-[26px] font-extrabold leading-none tabular-nums text-ink" data-count={totalVisitors}>{fmt(totalVisitors)}</div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-faint">Total</div>
                  </div>
                </div>
              </div>
              <ul className="flex-1 space-y-2.5">
                {slices.map((s) => (
                  <li key={s.label} className="flex items-center gap-3 text-[13.5px]">
                    <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: s.color }} />
                    <span className="min-w-0 truncate text-ink/80">{s.label}</span>
                    <span className="ml-auto font-bold tabular-nums text-ink">{fmt(s.count)}</span>
                    <span className="w-12 text-right text-faint tabular-nums">({Math.round(s.pc)}%)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card padding="lg">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold tracking-tight text-ink">Top segmentos</h2>
              <p className="text-[12.5px] text-muted">Los segmentos con mayor tamaño de audiencia</p>
            </div>
          </div>
          {top.length === 0 ? (
            <p className="mt-6 text-[13px] text-muted">Todavía no hay segmentos con audiencia. Aparecen al registrar asistencias.</p>
          ) : (
            <div className="mt-3">
              {top.map((s, i) => {
                const color = paletteAt(i);
                const Icon = TYPE_META[s.id.replace('fans-', '')]?.Icon ?? Heart;
                return (
                  <a key={s.id} href={`/app/segmentos/${encodeURIComponent(s.id)}`}
                    className={cn('group flex items-center gap-3.5 border-t border-line/70 py-2.5 first:border-t-0', focusRing)}>
                    <span className="w-4 flex-none text-center text-[13px] font-bold text-faint">{i + 1}</span>
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-lg" style={{ background: `${color}1a`, color }}>
                      <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 sm:w-[190px] sm:flex-none">
                      <p className="truncate text-[14px] font-bold text-ink">{s.label}</p>
                      <p className="truncate text-[12px] text-muted">{s.description}</p>
                    </div>
                    <div className="hidden h-2 flex-1 overflow-hidden rounded-full bg-surface-container sm:block">
                      <i className="block h-full rounded-full" data-bar={((s.count / topMax) * 100).toFixed(1)} style={{ width: `${(s.count / topMax) * 100}%`, background: color }} />
                    </div>
                    <div className="ml-auto min-w-[52px] text-right sm:ml-0">
                      <div className="text-[15px] font-extrabold tabular-nums text-ink" data-count={s.count}>{fmt(s.count)}</div>
                      <div className="text-[11.5px] text-faint tabular-nums">{Math.round((s.count / donutSum) * 100)}%</div>
                    </div>
                    <ChevronRight size={17} strokeWidth={2} aria-hidden="true" className="flex-none text-faint transition-transform group-hover:translate-x-0.5" />
                  </a>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Segmentos por afinidad (engagement) */}
      {afinidadCards.length > 0 ? (
        <section className="mt-7">
          <h2 className="text-[17px] font-bold tracking-tight text-ink">Segmentos por afinidad</h2>
          <p className="text-[13px] text-muted">Agrupados según comportamiento y frecuencia</p>
          <div className="mt-3.5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {afinidadCards.map((s) => {
              const meta = ENGAGEMENT_META[s.id] ?? { tint: 'bg-surface-container text-faint', Icon: Activity };
              return (
                <a key={s.id} href={`/app/segmentos/${encodeURIComponent(s.id)}`} className={cn('group block rounded-2xl', focusRing)}>
                  <Card padding="md" interactive className="relative h-full">
                    <ChevronRight size={18} strokeWidth={2} aria-hidden="true" className="absolute right-4 top-4 text-faint transition-transform group-hover:translate-x-0.5" />
                    <span className={cn('mb-3 grid h-9 w-9 place-items-center rounded-xl', meta.tint)}>
                      <meta.Icon size={19} strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <p className="text-[14px] font-bold text-ink">{s.label}</p>
                    <p className="mt-0.5 text-[30px] font-extrabold leading-none tracking-tight text-ink tabular-nums" data-count={s.count}>{fmt(s.count)}</p>
                    <p className="mt-1.5 text-[12.5px] text-muted">{s.description}</p>
                  </Card>
                </a>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Ciclos y categorías */}
      {categorias.length > 0 ? (
        <section className="mt-7">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-[17px] font-bold tracking-tight text-ink">Ciclos y categorías</h2>
              <p className="text-[13px] text-muted">Interesados en ciclos específicos (al menos una asistencia)</p>
            </div>
          </div>
          <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {categorias.sort((a, b) => b.count - a.count).map((s) => (
              <a key={s.id} href={`/app/segmentos/${encodeURIComponent(s.id)}`}
                className={cn('group flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 shadow-sm hover:border-brand/40', focusRing)}>
                <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-brand/10 text-brand">
                  <Heart size={16} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{s.label}</span>
                <span className="font-extrabold tabular-nums text-ink" data-count={s.count}>{fmt(s.count)}</span>
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" className="flex-none text-faint transition-transform group-hover:translate-x-0.5" />
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-7 flex items-center gap-2 text-[13px] text-faint">
        <BarChart3 size={15} strokeWidth={1.75} aria-hidden="true" />
        Los conteos se calculan en vivo sobre el historial de asistencias; los segmentos por categoría aparecen y desaparecen con la programación.
      </p>
    </div>
  );
}
