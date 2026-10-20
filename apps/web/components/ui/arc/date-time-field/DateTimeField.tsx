'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Portal as PopoverPortal } from '@radix-ui/react-popover';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '../../Popover';
import { cn, focusRing } from '../../cn';
import { MonthGrid, monthGridKeyTarget } from '../calendar';
import { useToday } from '../date-range-picker/useToday';
import { DEFAULT_TZ, addDays, addMonths, monthDiff, monthStart, todayYmd, type Ymd } from '../date-range-picker/ymd';
import {
  clampLocal, formatDateTime, from12h, joinLocal, minuteOptions, nextHalfHour, nextSaturday, nowLocal, parseDateTime, splitLocal, to12h, withinBounds,
} from './format';

/**
 * Selector de fecha y hora. Es un campo real (`<input type="text">`): se puede escribir «12/11/2026, 7:00 p. m.» o abrir
 * el calendario. Entra y sale como 'YYYY-MM-DDTHH:mm' (hora local, igual que `datetime-local`). Cada cambio en el
 * calendario se emite al instante; «Listo» solo cierra (y confirma la propuesta si aún no había valor).
 */
export interface DateTimeFieldProps {
  /** El `<label htmlFor>` de la página apunta al input de texto. */
  id: string;
  /** '' o 'YYYY-MM-DDTHH:mm' (hora local). */
  value: string;
  onChange: (value: string) => void;
  /** Por defecto «Seleccionar fecha y hora». */
  placeholder?: string;
  /** 'YYYY-MM-DDTHH:mm' */
  min?: string;
  max?: string;
  /** Paso de los minutos del selector (por defecto 5). Escribir a mano admite cualquier minuto. */
  minuteStep?: 5 | 10 | 15 | 30;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  className?: string;
}

const ERROR_MS = 3500;
const LABEL = 'Elegir fecha y hora';
const BTN_FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';
const SELECT_CLS = cn('min-h-10 w-full appearance-none rounded-field border border-border-strong bg-surface pl-3 pr-9 text-[14px] tabular-nums text-ink disabled:opacity-60', focusRing);
const CHEVRON = <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />;

export function DateTimeField({
  id, value, onChange, placeholder = 'Seleccionar fecha y hora', min, max, minuteStep = 5, required, disabled = false, invalid = false,
  'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, className,
}: DateTimeFieldProps) {
  const uid = useId();
  const statusId = `${id}-status`;
  const today = useToday(DEFAULT_TZ);
  const valid = splitLocal(value) ? value : '';
  const minDate = splitLocal(min)?.date;
  const maxDate = splitLocal(max)?.date;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => formatDateTime(valid));
  const [flash, setFlash] = useState(false);
  // Propuesta mientras no hay valor (hoy a la siguiente media hora); también recuerda lo último elegido si el padre no refleja el cambio.
  const [proposal, setProposal] = useState('');
  const [view, setView] = useState<Ymd>(() => monthStart(splitLocal(valid)?.date ?? todayYmd()));
  const [dir, setDir] = useState<-1 | 0 | 1>(0);
  const [focusKey, setFocusKey] = useState<Ymd>(() => splitLocal(valid)?.date ?? todayYmd());

  const panelRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // El texto sigue al valor del padre.
  useEffect(() => { setText(formatDateTime(valid)); }, [valid]);

  const current = splitLocal(valid || proposal) ? (valid || proposal) : '';
  const cur = splitLocal(current);
  const { hour12, pm } = to12h(cur?.hour ?? 0);
  const minutes = useMemo(() => minuteOptions(minuteStep, cur?.minute), [minuteStep, cur?.minute]);

  function showError() {
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), ERROR_MS);
  }

  function commitText() {
    const t = text.trim();
    if (t === formatDateTime(valid)) { setText(formatDateTime(valid)); return; }
    if (t === '') { if (valid) onChange(''); setText(''); return; }
    const parsed = parseDateTime(t);
    if (parsed && withinBounds(parsed, min, max)) {
      if (parsed !== valid) onChange(parsed);
      setText(formatDateTime(parsed));
      setFlash(false);
      return;
    }
    setText(formatDateTime(valid));
    showError();
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      if (disabled) return;
      const base = valid || clampLocal(nextHalfHour(nowLocal(DEFAULT_TZ)), min, max);
      setProposal(base);
      const date = splitLocal(base)!.date;
      setView(monthStart(date));
      setFocusKey(date);
      setDir(0);
    }
    setOpen(next);
  }

  function change(next: string) {
    const v = clampLocal(next, min, max);
    setProposal(v);
    setFocusKey(splitLocal(v)!.date);
    if (v !== valid) onChange(v);
  }

  const withParts = (patch: Partial<{ date: Ymd; hour: number; minute: number }>) => {
    const base = cur ?? splitLocal(clampLocal(nextHalfHour(nowLocal(DEFAULT_TZ)), min, max))!;
    const p = { ...base, ...patch };
    change(joinLocal(p.date, p.hour, p.minute));
  };

  function pickDate(d: Ymd) {
    if ((minDate && d < minDate) || (maxDate && d > maxDate)) return;
    withParts({ date: d });
    if (monthDiff(d, view) !== 0) goTo(monthStart(d));
  }

  function goTo(nextView: Ymd) {
    const delta = monthDiff(nextView, view);
    if (!delta) return;
    setDir(delta > 0 ? 1 : -1);
    setView(nextView);
  }

  // Tras una tecla de navegación el foco va al día recién elegido (el mes pudo cambiar).
  useLayoutEffect(() => {
    if (!open || !pendingFocus.current) return;
    const node = panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusKey}"]`);
    if (node) { pendingFocus.current = false; node.focus({ preventScroll: true }); }
  }, [open, focusKey, view]);

  function onDayKey(e: ReactKeyboardEvent<HTMLButtonElement>, d: Ymd) {
    const next = monthGridKeyTarget(e, d, { weekStartsOn: 1, min: minDate, max: maxDate });
    if (!next) return;
    e.preventDefault();
    setFocusKey(next);
    pendingFocus.current = true;
    if (monthDiff(next, view) !== 0) goTo(monthStart(next));
  }

  function onPmKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const radios = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const nextPm = !pm;
    withParts({ hour: from12h(hour12, nextPm) });
    radios[nextPm ? 1 : 0]?.focus();
  }

  const selectedDate = cur?.date ?? null;
  const tabbable = monthDiff(focusKey, view) === 0 ? focusKey : selectedDate && monthDiff(selectedDate, view) === 0 ? selectedDate : view;
  const prevDisabled = Boolean(minDate && monthDiff(view, minDate) <= 0);
  const nextDisabled = Boolean(maxDate && monthDiff(view, maxDate) >= 0);
  const todayNow = today || todayYmd(DEFAULT_TZ);
  const presets: { key: string; label: string; date: Ymd }[] = [
    { key: 'hoy', label: 'Hoy', date: todayNow },
    { key: 'manana', label: 'Mañana', date: addDays(todayNow, 1) },
    { key: 'sabado', label: 'Próximo sábado', date: nextSaturday(todayNow) },
  ];

  const isInvalid = invalid || flash || ariaInvalid === true;
  const describedIds = [describedBy, flash ? statusId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('w-full', className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverAnchor asChild>
          <div className="relative">
            <input
              id={id} type="text" value={text} placeholder={placeholder} required={required} disabled={disabled}
              autoComplete="off" inputMode="text"
              aria-invalid={isInvalid || undefined} aria-describedby={describedIds}
              onChange={(e) => setText(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitText(); } }}
              className={cn(
                'min-h-11 w-full rounded-field border bg-surface pl-3 pr-12 text-[14px] tabular-nums text-ink placeholder:text-faint md:min-h-10',
                'disabled:cursor-not-allowed disabled:opacity-60',
                isInvalid ? 'border-danger-fg' : 'border-border-strong',
                focusRing,
              )}
            />
            <PopoverTrigger asChild>
              <button type="button" disabled={disabled} aria-label={LABEL} aria-haspopup="dialog" aria-expanded={open}
                className={cn('absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-field text-muted transition-colors hover:bg-surface-container hover:text-ink disabled:cursor-not-allowed disabled:opacity-60', BTN_FOCUS)}>
                <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <p id={statusId} role="status" className="mt-1 text-[12px] font-medium text-danger-fg empty:hidden">{flash ? 'Fecha no válida' : ''}</p>
        <PopoverPortal>
          <PopoverContent ref={panelRef} align="start" sideOffset={8} collisionPadding={8} aria-label={LABEL}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              panelRef.current?.querySelector<HTMLButtonElement>('button[data-date][tabindex="0"]')?.focus({ preventScroll: true });
            }}
            className="arc-pop z-50 max-w-[calc(100vw-16px)] overflow-hidden rounded-card border border-line bg-surface text-ink shadow-xl"
            style={{ '--cell': '40px' } as CSSProperties}>
            <div role="group" aria-label="Atajos" className="flex flex-wrap gap-1.5 border-b border-line p-2">
              {presets.map((p) => (
                <button key={p.key} type="button" data-preset={p.key} aria-pressed={selectedDate === p.date}
                  disabled={Boolean((minDate && p.date < minDate) || (maxDate && p.date > maxDate))}
                  onClick={() => { pickDate(p.date); }}
                  className={cn(
                    'min-h-9 whitespace-nowrap rounded-field px-3 py-1.5 text-[13px] text-muted transition-colors hover:bg-surface-container',
                    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
                    'aria-pressed:bg-brand-soft aria-pressed:font-semibold aria-pressed:text-brand-text', BTN_FOCUS,
                  )}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="relative p-3">
              <button type="button" aria-label="Mes anterior" disabled={prevDisabled} onClick={() => goTo(addMonths(view, -1))}
                className={cn('absolute left-3 top-3 z-[2] grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-container disabled:opacity-40', BTN_FOCUS)}>
                <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button type="button" aria-label="Mes siguiente" disabled={nextDisabled} onClick={() => goTo(addMonths(view, 1))}
                className={cn('absolute right-3 top-3 z-[2] grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-container disabled:opacity-40', BTN_FOCUS)}>
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <div key={view} className="arc-drp-months" data-dir={dir || undefined} style={{ width: 'calc(7 * var(--cell))' }}>
                <MonthGrid month={view} selected={selectedDate} tabbable={tabbable} today={today} min={minDate} max={maxDate} idBase={uid}
                  onPick={pickDate} onKey={onDayKey} onFocusDay={setFocusKey} />
              </div>
            </div>
            <div className="flex items-end gap-2 border-t border-line p-3" style={{ width: 'calc(7 * var(--cell) + 24px)' }}>
              <div className="relative min-w-0 flex-1">
                <select aria-label="Hora" value={hour12} className={SELECT_CLS} onChange={(e) => withParts({ hour: from12h(Number(e.target.value), pm) })}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                {CHEVRON}
              </div>
              <span aria-hidden="true" className="pb-2 font-semibold text-muted">:</span>
              <div className="relative min-w-0 flex-1">
                <select aria-label="Minutos" value={cur?.minute ?? 0} className={SELECT_CLS} onChange={(e) => withParts({ minute: Number(e.target.value) })}>
                  {minutes.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                </select>
                {CHEVRON}
              </div>
              <div role="radiogroup" aria-label="Mañana o tarde" onKeyDown={onPmKey} className="flex flex-none rounded-field border border-border-strong bg-surface-container p-0.5">
                {[false, true].map((isPm) => (
                  <button key={String(isPm)} type="button" role="radio" aria-checked={pm === isPm} tabIndex={pm === isPm ? 0 : -1}
                    onClick={() => withParts({ hour: from12h(hour12, isPm) })}
                    className={cn(
                      'min-h-9 whitespace-nowrap rounded-[calc(var(--radius-field,8px)-2px)] px-2.5 text-[13px] text-muted transition-colors',
                      'aria-checked:bg-brand aria-checked:font-semibold aria-checked:text-brand-fg', BTN_FOCUS,
                    )}>
                    {isPm ? 'p. m.' : 'a. m.'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line p-3">
              <button type="button" disabled={!valid} onClick={() => { onChange(''); setProposal(''); handleOpenChange(false); }}
                className={cn('min-h-10 rounded-field border border-line bg-surface px-4 text-[13px] font-semibold text-muted hover:bg-surface-container hover:text-ink disabled:cursor-not-allowed disabled:opacity-50', BTN_FOCUS)}>
                Limpiar
              </button>
              <button type="button" onClick={() => { if (!valid && current) onChange(current); handleOpenChange(false); }}
                className={cn('min-h-10 rounded-field bg-brand px-5 text-[13px] font-bold text-brand-fg hover:brightness-95', BTN_FOCUS)}>
                Listo
              </button>
            </div>
          </PopoverContent>
        </PopoverPortal>
      </Popover>
    </div>
  );
}

export default DateTimeField;
