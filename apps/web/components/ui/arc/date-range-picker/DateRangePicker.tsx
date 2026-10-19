'use client';

// Portado de arc-library (https://github.com/kuratlielia/arc-library) · MIT © 2026 Elia Kuratli.
// Origen: registry/components/date-range-picker/date-range-picker.tsx @ b40c890 (2026-10-16). Adaptado a contan2: Tailwind v4 +
// tokens de marca por tenant, sin `motion` (CSS + prefers-reduced-motion), es-DO. Ver ../ATTRIBUTION.md.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Portal as PopoverPortal } from '@radix-ui/react-popover';
import { Popover, PopoverContent, PopoverTrigger } from '../../Popover';
import { cn } from '../../cn';
import { DEFAULT_PRESETS, findPreset, matchPreset, validateRange, type RangePreset, type RangeProblem } from './presets';
import { useToday } from './useToday';
import {
  CUSTOM_LABEL, DEFAULT_TZ, WEEKDAYS_LONG, WEEKDAYS_MIN, addDays, addMonths, formatDayLong, formatMonthTitle,
  formatRangeLabel, formatRangeText, fromDays, isYmd, monthDiff, monthEnd, monthStart, rangeLength, startOfWeek, toDays, todayYmd, weekdayOf,
  type Ymd, type YmdRange,
} from './ymd';

export type { Ymd, YmdRange } from './ymd';
export type { RangePreset } from './presets';
export { DEFAULT_PRESETS } from './presets';

/**
 * Selector de rango de fechas para reportes y filtros. Un clic fija el inicio, el segundo cierra el rango y
 * «Aplicar» confirma; también se puede tipear «Desde» y «Hasta». Los valores entran y salen como 'YYYY-MM-DD'
 * (inclusivo) y los atajos se calculan sobre el «hoy» de la zona del tenant, no el del dispositivo.
 */
export interface DateRangePickerProps {
  /** `null` = sin rango (filtro opcional): el trigger muestra `placeholder` y el panel arranca en hoy. */
  value: YmdRange | null;
  onChange: (range: YmdRange, presetKey: string | null) => void;
  /** Atajo vigente: etiqueta del trigger sin depender de «hoy» (el HTML del servidor no cambia al hidratar). */
  presetKey?: string | null;
  presets?: RangePreset[];
  label?: string;
  min?: Ymd;
  max?: Ymd | 'today';
  /** Máximo de días del rango (366 = MAX_REPORT_RANGE_DAYS de la API). */
  maxDays?: number;
  weekStartsOn?: 0 | 1;
  timeZone?: string;
  months?: 'auto' | 1 | 2;
  placeholder?: string;
  /** Si se define y hay valor, el pie del panel ofrece «Quitar fechas». */
  onClear?: () => void;
  disabled?: boolean;
  className?: string;
}

const WIDE_MIN = 760;
const FIELD_CLS = 'rounded-field border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] font-normal normal-case tracking-normal text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';
const DAY_FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

const MESSAGES: Record<RangeProblem, (maxDays?: number) => string> = {
  order: () => 'La fecha inicial no puede ser posterior a la final.',
  maxDays: (n) => `Máximo ${n} días.`,
  bounds: () => 'Hay fechas fuera del rango permitido.',
};

const ordered = (a: Ymd, b: Ymd): YmdRange => (a <= b ? { from: a, to: b } : { from: b, to: a });

/** Texto que «rueda» al cambiar: el elemento nuevo (key = texto) anima solo si difiere del texto con que montó. */
function Roll({ text, className }: { text: string; className?: string }) {
  const initial = useRef(text);
  return <span key={text} className={cn('arc-drp-roll', className)} data-animate={text !== initial.current ? 'true' : undefined}>{text}</span>;
}

interface MonthProps {
  month: Ymd;
  range: YmdRange;
  tabbable: Ymd;
  today: Ymd;
  min?: Ymd;
  max?: Ymd;
  weekStartsOn: 0 | 1;
  idBase: string;
  onPick: (d: Ymd) => void;
  onHover: (d: Ymd) => void;
  onKey: (e: ReactKeyboardEvent<HTMLButtonElement>, d: Ymd) => void;
  onFocusDay: (d: Ymd) => void;
}

function Month({ month, range, tabbable, today, min, max, weekStartsOn, idBase, onPick, onHover, onKey, onFocusDay }: MonthProps) {
  const first = toDays(startOfWeek(monthStart(month), weekStartsOn));
  const mStart = toDays(monthStart(month)), mEnd = toDays(monthEnd(month));
  const lo = toDays(range.from), hi = toDays(range.to);
  const titleId = `${idBase}-${monthStart(month)}`;

  // Tajada del rango en cada semana, en % de la fila (la barra se estira con una transición CSS).
  const segments = Array.from({ length: 6 }, (_, row) => {
    const rowStart = first + row * 7;
    const rf = Math.max(rowStart, mStart), rl = Math.min(rowStart + 6, mEnd);
    if (rf > rl) return null;
    const from = Math.max(lo, rf), to = Math.min(hi, rl);
    if (from <= to) return { left: ((from - rowStart) / 7) * 100, width: ((to - from + 1) / 7) * 100 };
    return { left: (((rl < lo ? rl + 1 : rf) - rowStart) / 7) * 100, width: 0 };
  });

  return (
    <div className="arc-drp-month">
      <p id={titleId} className="mb-2 text-center text-[13px] font-semibold capitalize text-ink">{formatMonthTitle(month)}</p>
      <div role="grid" aria-labelledby={titleId}>
        <div role="row" className="grid grid-cols-7">
          {Array.from({ length: 7 }, (_, c) => {
            const wd = (weekStartsOn + c) % 7;
            return <span key={wd} role="columnheader" aria-label={WEEKDAYS_LONG[wd]} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-faint">{WEEKDAYS_MIN[wd]}</span>;
          })}
        </div>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute inset-0">
            {segments.map((s, row) => (
              <span key={row} className="arc-drp-bar" data-empty={!s || s.width === 0 || undefined}
                style={{ top: `calc(${row} * var(--cell) + 3px)`, left: `${s?.left ?? 0}%`, width: `${s?.width ?? 0}%` }} />
            ))}
          </span>
          {Array.from({ length: 6 }, (_, row) => (
            <div key={row} role="row" className="relative grid grid-cols-7" style={{ height: 'var(--cell)' }}>
              {Array.from({ length: 7 }, (_, col) => {
                const n = first + row * 7 + col;
                if (n < mStart || n > mEnd) return <span key={n} role="gridcell" />;
                const d = fromDays(n);
                const disabled = Boolean((min && d < min) || (max && d > max));
                const inRange = n >= lo && n <= hi;
                const edge = n === lo || n === hi;
                const isToday = d === today;
                return (
                  <span key={n} role="gridcell" aria-selected={inRange} className="grid place-items-center">
                    <button type="button" data-date={d} data-edge={edge || undefined} data-range={inRange || undefined} data-today={isToday || undefined}
                      tabIndex={d === tabbable ? 0 : -1} disabled={disabled} aria-current={isToday ? 'date' : undefined} aria-label={formatDayLong(d)}
                      className={cn(
                        'relative z-[1] grid place-items-center rounded-full text-[13px] tabular-nums text-ink transition-colors hover:bg-surface-container',
                        'disabled:cursor-not-allowed disabled:text-faint disabled:opacity-50 disabled:hover:bg-transparent',
                        'data-[today]:font-bold data-[today]:ring-1 data-[today]:ring-inset data-[today]:ring-brand-strong',
                        'data-[edge]:bg-brand data-[edge]:font-semibold data-[edge]:text-brand-fg data-[edge]:hover:bg-brand',
                        DAY_FOCUS,
                      )}
                      style={{ width: 'calc(var(--cell) - 6px)', height: 'calc(var(--cell) - 6px)' }}
                      onClick={() => onPick(d)} onPointerEnter={() => { if (!disabled) onHover(d); }}
                      onFocus={() => onFocusDay(d)} onKeyDown={(e) => onKey(e, d)}>
                      {Number(d.slice(8))}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DateRangePicker({
  value, onChange, presetKey = null, presets = DEFAULT_PRESETS, label = 'Período', min, max, maxDays,
  weekStartsOn = 1, timeZone = DEFAULT_TZ, months = 'auto', placeholder = 'Cualquier fecha', onClear, disabled = false, className,
}: DateRangePickerProps) {
  const uid = useId();
  const today = useToday(timeZone);
  const base = useMemo<YmdRange>(() => value ?? { from: today || todayYmd(timeZone), to: today || todayYmd(timeZone) }, [value, today, timeZone]);
  const maxResolved = max === 'today' ? (today || undefined) : max;

  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [draft, setDraft] = useState<YmdRange>(() => value ?? { from: todayYmd(timeZone), to: todayYmd(timeZone) });
  // Sin valor, el borrador de hoy no es una elección: no marca ningún atajo hasta que la persona toque algo.
  const [blank, setBlank] = useState(value === null);
  const [anchor, setAnchor] = useState<Ymd | null>(null);
  const [hover, setHover] = useState<Ymd | null>(null);
  const [view, setView] = useState<Ymd>(() => monthStart(value?.to ?? todayYmd(timeZone)));
  const [dir, setDir] = useState<-1 | 0 | 1>(0);
  const [focusKey, setFocusKey] = useState<Ymd>(() => value?.from ?? todayYmd(timeZone));

  const panelRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);

  const count = compact ? 1 : 2;
  const visible = useMemo(() => Array.from({ length: count }, (_, i) => addMonths(view, i)), [count, view]);
  const shown = anchor ? ordered(anchor, hover ?? anchor) : draft;
  const problem = validateRange(shown, { maxDays, min, max: maxResolved });
  const pressedKey = today && !anchor && !blank ? matchPreset(draft, today, presets) : null;

  const measureCompact = () => months === 1 || (months === 'auto' && typeof window !== 'undefined' && window.innerWidth < WIDE_MIN);
  const viewFor = (r: YmdRange, single: boolean) => (single ? monthStart(r.to) : monthStart(addMonths(r.to, -1)));

  function handleOpenChange(next: boolean) {
    if (next) {
      if (disabled || !today) return;
      const single = measureCompact();
      setCompact(single);
      setDraft(base);
      setBlank(value === null);
      setAnchor(null);
      setHover(null);
      setView(viewFor(base, single));
      setDir(0);
      setFocusKey(base.from);
    } else {
      setAnchor(null);
      setHover(null);
    }
    setOpen(next);
  }

  // Recalcula uno/dos meses al girar el dispositivo o redimensionar con el panel abierto.
  useEffect(() => {
    if (!open || months !== 'auto') return;
    const onResize = () => setCompact(window.innerWidth < WIDE_MIN);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, months]);

  // Foco: tras una tecla de navegación, al día recién elegido (el mes pudo cambiar).
  useLayoutEffect(() => {
    if (!open || !pendingFocus.current) return;
    const node = panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusKey}"]`);
    if (node) { pendingFocus.current = false; node.focus({ preventScroll: true }); }
  }, [open, focusKey, view, compact]);

  const onScreen = (d: Ymd) => visible.some((m) => monthDiff(d, m) === 0);
  const tabbable = onScreen(focusKey) ? focusKey : onScreen(shown.from) ? shown.from : visible[0]!;

  function goTo(nextView: Ymd) {
    const delta = monthDiff(nextView, view);
    if (!delta) return;
    setDir(delta > 0 ? 1 : -1);
    setView(nextView);
  }

  function reveal(r: YmdRange) {
    if (monthDiff(r.from, view) >= 0 && monthDiff(r.to, visible[count - 1]!) <= 0) return;
    goTo(viewFor(r, compact));
  }

  function pick(d: Ymd) {
    setFocusKey(d);
    if (!anchor) { setAnchor(d); setHover(d); return; }
    setDraft(ordered(anchor, d));
    setBlank(false);
    setAnchor(null);
    setHover(null);
  }

  function choosePreset(p: RangePreset) {
    if (!today) return;
    const r = p.range(today);
    setDraft(r);
    setBlank(false);
    setAnchor(null);
    setHover(null);
    setFocusKey(r.from);
    reveal(r);
  }

  function typeDate(which: 'from' | 'to', v: string) {
    if (!isYmd(v)) return;
    const next = { ...shown, [which]: v } as YmdRange;
    setAnchor(null);
    setHover(null);
    setDraft(next);
    setBlank(false);
    setFocusKey(v);
    reveal({ from: which === 'from' ? v : next.from, to: next.to < next.from ? next.from : next.to });
  }

  function apply() {
    const range = anchor ? { from: anchor, to: anchor } : draft;
    if (validateRange(range, { maxDays, min, max: maxResolved })) return;
    onChange(range, today ? matchPreset(range, today, presets) : null);
    handleOpenChange(false);
  }

  function onDayKey(e: ReactKeyboardEvent<HTMLButtonElement>, d: Ymd) {
    const wd = (weekdayOf(d) - weekStartsOn + 7) % 7; // 0..6 desde el inicio de semana
    const moves: Record<string, () => Ymd> = {
      ArrowLeft: () => addDays(d, -1), ArrowRight: () => addDays(d, 1), ArrowUp: () => addDays(d, -7), ArrowDown: () => addDays(d, 7),
      Home: () => addDays(d, -wd), End: () => addDays(d, 6 - wd),
      PageUp: () => addMonths(d, e.shiftKey ? -12 : -1), PageDown: () => addMonths(d, e.shiftKey ? 12 : 1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    let next = move();
    if (min && next < min) next = min;
    if (maxResolved && next > maxResolved) next = maxResolved;
    setFocusKey(next);
    if (anchor) setHover(next);
    pendingFocus.current = true;
    if (monthDiff(next, view) < 0) goTo(monthStart(next));
    else if (monthDiff(next, visible[count - 1]!) > 0) goTo(addMonths(monthStart(next), -(count - 1)));
  }

  function onRailKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const keys = compact ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    if (!keys.includes(e.key)) return;
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-preset]'));
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    buttons[(at + (e.key === keys[1] ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }

  // Trigger: texto determinístico a partir de las props (sin Intl ni «hoy»).
  const presetLabel = findPreset(presetKey, presets)?.label ?? CUSTOM_LABEL;
  const triggerText = value ? formatRangeLabel(value, findPreset(presetKey, presets)?.label ?? null) : placeholder;
  const days = rangeLength(shown);
  const status = problem
    ? MESSAGES[problem](maxDays)
    : anchor ? `Inicio ${formatRangeText({ from: anchor, to: anchor })}. Elige la fecha final.` : `${formatRangeText(shown)} · ${days} ${days === 1 ? 'día' : 'días'}`;

  const prevDisabled = Boolean(min && monthDiff(view, min) <= 0);
  const nextDisabled = Boolean(maxResolved && monthDiff(visible[count - 1]!, maxResolved) >= 0);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled || !today} aria-haspopup="dialog" aria-label={`${label}: ${triggerText}`}
          className={cn(
            'inline-flex min-h-11 items-center gap-2 rounded-field border border-border-strong bg-surface px-3 text-[13px] text-ink transition-colors md:min-h-10',
            'hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            className,
          )}>
          <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-muted" />
          <span className="min-w-0 truncate">
            {value ? (
              <>
                <Roll text={presetLabel} className="font-semibold" />
                <Roll text={` · ${formatRangeText(value)}`} className="text-muted" />
              </>
            ) : (
              <span className="text-muted">{placeholder}</span>
            )}
          </span>
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className={cn('flex-none text-muted transition-transform', open && 'rotate-180')} />
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent ref={panelRef} align="start" sideOffset={8} collisionPadding={8} aria-label={label}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            panelRef.current?.querySelector<HTMLButtonElement>('button[data-date][tabindex="0"]')?.focus({ preventScroll: true });
          }}
          className="arc-pop z-50 max-w-[calc(100vw-16px)] overflow-hidden rounded-card border border-line bg-surface text-ink shadow-xl"
          style={{ '--cell': compact ? '40px' : '36px' } as CSSProperties}>
          <div className={cn('flex', compact ? 'flex-col' : 'flex-row')}>
            <div role="group" aria-label="Atajos" onKeyDown={onRailKey}
              className={cn(compact ? 'flex gap-1.5 overflow-x-auto border-b border-line p-2' : 'flex w-40 flex-none flex-col gap-0.5 border-r border-line p-2')}>
              {presets.map((p) => (
                <button key={p.key} type="button" data-preset={p.key} aria-pressed={pressedKey === p.key} onClick={() => choosePreset(p)}
                  className={cn(
                    'min-h-9 flex-none whitespace-nowrap rounded-field px-3 py-2 text-left text-[13px] text-muted transition-colors hover:bg-surface-container',
                    'aria-pressed:bg-brand-soft aria-pressed:font-semibold aria-pressed:text-brand-text', DAY_FOCUS,
                  )}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="relative p-3" onPointerLeave={() => { if (anchor) setHover(null); }}>
              <button type="button" aria-label="Mes anterior" disabled={prevDisabled} onClick={() => goTo(addMonths(view, -1))}
                className={cn('absolute left-3 top-3 z-[2] grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-container disabled:opacity-40', DAY_FOCUS)}>
                <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button type="button" aria-label="Mes siguiente" disabled={nextDisabled} onClick={() => goTo(addMonths(view, 1))}
                className={cn('absolute right-3 top-3 z-[2] grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-container disabled:opacity-40', DAY_FOCUS)}>
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <div key={`${view}-${count}`} className="arc-drp-months flex gap-4" data-dir={dir || undefined}>
                {visible.map((m) => (
                  <div key={m} style={{ width: 'calc(7 * var(--cell))' }}>
                    <Month month={m} range={shown} tabbable={tabbable} today={today} min={min} max={maxResolved} weekStartsOn={weekStartsOn} idBase={uid}
                      onPick={pick} onHover={(d) => { if (anchor) setHover(d); }} onKey={onDayKey} onFocusDay={setFocusKey} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-line p-3">
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              Desde
              <input type="date" value={shown.from} min={min} max={maxResolved} onChange={(e) => typeDate('from', e.target.value)} className={FIELD_CLS} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              Hasta
              <input type="date" value={shown.to} min={min} max={maxResolved} onChange={(e) => typeDate('to', e.target.value)} className={FIELD_CLS} />
            </label>
            <p aria-live="polite" className={cn('min-w-[8rem] flex-1 self-center text-[12.5px]', problem ? 'font-medium text-danger-fg' : 'text-muted')}>{status}</p>
            <div className="ml-auto flex gap-2">
              {onClear && value && (
                <button type="button" onClick={() => { onClear(); handleOpenChange(false); }}
                  className={cn('min-h-10 rounded-field border border-line bg-surface px-4 text-[13px] font-semibold text-muted hover:bg-surface-container hover:text-ink', DAY_FOCUS)}>
                  Quitar fechas
                </button>
              )}
              <button type="button" onClick={() => handleOpenChange(false)}
                className={cn('min-h-10 rounded-field border border-line bg-surface px-4 text-[13px] font-semibold text-ink hover:bg-surface-container', DAY_FOCUS)}>
                Cancelar
              </button>
              <button type="button" onClick={apply} disabled={!!problem}
                className={cn('min-h-10 rounded-field bg-brand px-4 text-[13px] font-bold text-brand-fg hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50', DAY_FOCUS)}>
                Aplicar
              </button>
            </div>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

export default DateRangePicker;
