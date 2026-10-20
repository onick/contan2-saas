'use client';

// Cuadrícula de un mes de selección simple, hermana del `Month` (de rango) del DateRangePicker: mismo lenguaje visual
// (celdas --cell, día de hoy con anillo, seleccionado en color de marca) pero sin barras de rango ni hover.
// Es presentacional: el padre maneja vista, foco y teclado (ver `monthGridKeyTarget`).

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { cn } from '../../cn';
import {
  WEEKDAYS_LONG, WEEKDAYS_MIN, addDays, addMonths, formatDayLong, formatMonthTitle, fromDays, monthEnd, monthStart, startOfWeek, toDays, weekdayOf,
  type Ymd,
} from '../date-range-picker/ymd';

export interface MonthGridProps {
  /** Cualquier día del mes a mostrar. */
  month: Ymd;
  selected?: Ymd | null;
  /** Día con tabIndex 0 (roving tabindex). */
  tabbable: Ymd;
  today: Ymd | '';
  min?: Ymd;
  max?: Ymd;
  weekStartsOn?: 0 | 1;
  /** Prefijo para ids únicos del título del mes. */
  idBase: string;
  onPick: (d: Ymd) => void;
  onKey: (e: ReactKeyboardEvent<HTMLButtonElement>, d: Ymd) => void;
  onFocusDay: (d: Ymd) => void;
}

const DAY_FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

/**
 * Destino de una tecla de navegación sobre un día (flechas, Inicio/Fin, RePág/AvPág; con Shift salta un año),
 * acotado a [min, max]. null si la tecla no navega.
 */
export function monthGridKeyTarget(e: Pick<ReactKeyboardEvent, 'key' | 'shiftKey'>, d: Ymd, opts: { weekStartsOn?: 0 | 1; min?: Ymd; max?: Ymd } = {}): Ymd | null {
  const ws = opts.weekStartsOn ?? 1;
  const wd = (weekdayOf(d) - ws + 7) % 7;
  const moves: Record<string, () => Ymd> = {
    ArrowLeft: () => addDays(d, -1), ArrowRight: () => addDays(d, 1), ArrowUp: () => addDays(d, -7), ArrowDown: () => addDays(d, 7),
    Home: () => addDays(d, -wd), End: () => addDays(d, 6 - wd),
    PageUp: () => addMonths(d, e.shiftKey ? -12 : -1), PageDown: () => addMonths(d, e.shiftKey ? 12 : 1),
  };
  const move = moves[e.key];
  if (!move) return null;
  let next = move();
  if (opts.min && next < opts.min) next = opts.min;
  if (opts.max && next > opts.max) next = opts.max;
  return next;
}

export function MonthGrid({ month, selected, tabbable, today, min, max, weekStartsOn = 1, idBase, onPick, onKey, onFocusDay }: MonthGridProps) {
  const first = toDays(startOfWeek(monthStart(month), weekStartsOn));
  const mStart = toDays(monthStart(month)), mEnd = toDays(monthEnd(month));
  const titleId = `${idBase}-${monthStart(month)}`;

  return (
    <div>
      <p id={titleId} className="mb-2 text-center text-[13px] font-semibold capitalize text-ink">{formatMonthTitle(month)}</p>
      <div role="grid" aria-labelledby={titleId}>
        <div role="row" className="grid grid-cols-7">
          {Array.from({ length: 7 }, (_, c) => {
            const wd = (weekStartsOn + c) % 7;
            return <span key={wd} role="columnheader" aria-label={WEEKDAYS_LONG[wd]} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-faint">{WEEKDAYS_MIN[wd]}</span>;
          })}
        </div>
        {Array.from({ length: 6 }, (_, row) => (
          <div key={row} role="row" className="grid grid-cols-7" style={{ height: 'var(--cell)' }}>
            {Array.from({ length: 7 }, (_, col) => {
              const n = first + row * 7 + col;
              if (n < mStart || n > mEnd) return <span key={n} role="gridcell" />;
              const d = fromDays(n);
              const disabled = Boolean((min && d < min) || (max && d > max));
              const isSelected = d === selected;
              const isToday = d === today;
              return (
                <span key={n} role="gridcell" aria-selected={isSelected} className="grid place-items-center">
                  <button type="button" data-date={d} data-selected={isSelected || undefined} data-today={isToday || undefined}
                    tabIndex={d === tabbable ? 0 : -1} disabled={disabled} aria-current={isToday ? 'date' : undefined} aria-pressed={isSelected}
                    aria-label={formatDayLong(d)}
                    className={cn(
                      'grid place-items-center rounded-full text-[13px] tabular-nums text-ink transition-colors hover:bg-surface-container',
                      'disabled:cursor-not-allowed disabled:text-faint disabled:opacity-50 disabled:hover:bg-transparent',
                      'data-[today]:font-bold data-[today]:ring-1 data-[today]:ring-inset data-[today]:ring-brand-strong',
                      'data-[selected]:bg-brand data-[selected]:font-semibold data-[selected]:text-brand-fg data-[selected]:hover:bg-brand',
                      DAY_FOCUS,
                    )}
                    style={{ width: 'calc(var(--cell) - 6px)', height: 'calc(var(--cell) - 6px)' }}
                    onClick={() => onPick(d)} onFocus={() => onFocusDay(d)} onKeyDown={(e) => onKey(e, d)}>
                    {Number(d.slice(8))}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
