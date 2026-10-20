'use client';

// Portado de arc-library (https://github.com/kuratlielia/arc-library) · MIT © 2026 Elia Kuratli.
// Origen: registry/components/number-field/number-field.tsx @ b40c890 (2026-10-16). Adaptado a contan2: Tailwind v4 +
// tokens de marca por tenant, sin `motion` (CSS + prefers-reduced-motion), es-DO. Ver ../ATTRIBUTION.md.
//
// Contador de enteros con +/−. Diferencias con el original: sin scrub, sin repetir al mantener
// presionado, sin decimales/afijos/locale. Odómetro y "bump" viven en number-field.css.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Minus, Plus } from 'lucide-react';

export type NumberFieldSize = 'sm' | 'md' | 'kiosk';

export interface NumberFieldProps {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: NumberFieldSize;
  decrementLabel: string;
  incrementLabel: string;
  /** true: <input> con borrador; false (kiosko): role="spinbutton" sin input. */
  editable?: boolean;
  /** Oculta la etiqueta visible (el nombre accesible se conserva). */
  hideLabel?: boolean;
  /** true (default) muestra "Máximo N" en el tope; una función escribe el texto. */
  limitHint?: boolean | ((max: number) => string);
  /** Ocupa todo el ancho; el valor se estira entre los botones. */
  block?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

// Sin `cn` (tailwind-merge): el kiosko no debe cargarlo. Mismo anillo que `focusRing` de cn.ts.
const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

const KIOSK_FOCUS =
  'outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page';

const BTN: Record<NumberFieldSize, string> = {
  sm: 'h-8 w-8 rounded-lg border border-line bg-surface text-ink hover:bg-surface-container',
  md: 'h-10 w-10 rounded-lg bg-surface-container text-ink hover:bg-line',
  kiosk: 'h-12 w-12 rounded-xl bg-subtle text-ink hover:bg-surface-container',
};
const ICON: Record<NumberFieldSize, number> = { sm: 14, md: 16, kiosk: 20 };
const VALUE: Record<NumberFieldSize, string> = {
  sm: 'min-w-5 text-sm font-bold',
  md: 'min-w-6 text-[17px] font-bold',
  kiosk: 'min-w-8 text-lg font-semibold',
};
const INPUT_W: Record<NumberFieldSize, string> = { sm: 'w-10', md: 'w-14', kiosk: 'w-16' };

export function NumberField({
  label, value, onValueChange, min = 0, max, step = 1, size = 'md',
  decrementLabel, incrementLabel, editable = true, hideLabel = false,
  limitHint = true, block = false, disabled = false, id, className,
}: NumberFieldProps) {
  const autoId = useId();
  const inputId = id ?? `nf-${autoId}`;
  const hi = max ?? Number.POSITIVE_INFINITY;
  const atMin = value <= min;
  const atMax = value >= hi;
  const bigStep = max !== undefined && max - min > 20;

  const [draft, setDraft] = useState<string | null>(null);
  const [strain, setStrain] = useState<'min' | 'max' | null>(null);
  const [announce, setAnnounce] = useState('');
  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  const prev = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dirección del odómetro: solo tras un cambio real (el render inicial no anima → SSR estable).
  useEffect(() => {
    if (value !== prev.current) {
      setDir(value > prev.current ? 'up' : 'down');
      prev.current = value;
    }
  }, [value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const clamp = (n: number) => Math.min(hi, Math.max(min, n));

  function hitLimit(edge: 'min' | 'max') {
    setStrain(edge);
    setAnnounce(edge === 'max' ? `${String(hi)}, máximo` : `${String(min)}, mínimo`);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setStrain(null); setAnnounce(''); }, 1500);
  }

  function commit(n: number) {
    if (n > hi) { hitLimit('max'); n = hi; }
    else if (n < min) { hitLimit('min'); n = min; }
    setDraft(null);
    if (n !== value) onValueChange(n);
  }

  function bump(delta: number) {
    if (disabled) return;
    if (delta > 0 && atMax) return hitLimit('max');
    if (delta < 0 && atMin) return hitLimit('min');
    commit(clamp(value + delta));
  }

  function applyDraft() {
    if (draft === null) return;
    const text = draft.replace(/\D/g, '');
    setDraft(null);
    if (text === '') return; // vacío → vuelve al valor actual
    commit(Number(text));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (disabled) return;
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); bump(step); break;
      case 'ArrowDown': e.preventDefault(); bump(-step); break;
      case 'PageUp': if (bigStep) { e.preventDefault(); bump(step * 10); } break;
      case 'PageDown': if (bigStep) { e.preventDefault(); bump(-step * 10); } break;
      case 'Home': e.preventDefault(); commit(min); break;
      case 'End': if (max !== undefined) { e.preventDefault(); commit(max); } break;
      case 'Enter': if (draft !== null) { e.preventDefault(); applyDraft(); } break;
      case 'Escape': if (draft !== null) { e.preventDefault(); setDraft(null); } break;
    }
  }

  function onInputChange(raw: string) {
    const text = raw.replace(/\D/g, '');
    setDraft(text);
    if (text === '') return;
    const n = Number(text);
    if (n > hi) { hitLimit('max'); return; }
    if (n >= min && n !== value) onValueChange(n); // borrador válido: en vivo
  }

  const note = limitHint && max !== undefined && atMax
    ? (typeof limitHint === 'function' ? limitHint(max) : `Máximo ${String(max)}`)
    : null;

  const ring = size === 'kiosk' ? KIOSK_FOCUS : focusRing;

  const renderBtn = (kind: 'dec' | 'inc') => {
    const blocked = kind === 'dec' ? atMin : atMax;
    return (
      <button
        type="button"
        className={cn('arc-nf-btn grid flex-none place-items-center transition-colors', BTN[size], ring)}
        aria-label={kind === 'dec' ? decrementLabel : incrementLabel}
        aria-disabled={blocked ? 'true' : undefined}
        disabled={disabled}
        onClick={() => bump(kind === 'dec' ? -step : step)}
      >
        {kind === 'dec' ? <Minus size={ICON[size]} aria-hidden="true" /> : <Plus size={ICON[size]} aria-hidden="true" />}
      </button>
    );
  };

  const aria = {
    'aria-valuenow': value,
    'aria-valuemin': min,
    ...(max !== undefined ? { 'aria-valuemax': max } : {}),
  };

  return (
    <div className={cn('arc-nf flex flex-col', block ? 'w-full' : 'items-end', className)} data-strain={strain ?? undefined}>
      {editable && !hideLabel ? (
        <label htmlFor={inputId} className="mb-1 self-start text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</label>
      ) : null}
      <div className={cn('flex items-center', block ? 'w-full justify-between' : size === 'sm' ? 'gap-1.5' : 'gap-2.5')}>
        {renderBtn('dec')}
        {editable ? (
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            role="spinbutton"
            aria-label={hideLabel ? label : undefined}
            {...aria}
            disabled={disabled}
            value={draft ?? String(value)}
            onChange={(e) => onInputChange(e.target.value)}
            onBlur={applyDraft}
            onKeyDown={onKeyDown}
            className={cn(
              'num rounded-lg border border-border-strong bg-surface py-1 text-center font-bold tabular-nums text-ink',
              block ? 'mx-2 min-w-0 flex-1' : INPUT_W[size],
              size === 'sm' ? 'text-sm' : 'text-[17px]',
              size === 'kiosk' && 'h-12', // misma altura que los botones +/− (target de 44 px+)
              ring,
            )}
          />
        ) : (
          <div
            id={inputId}
            role="spinbutton"
            tabIndex={disabled ? -1 : 0}
            aria-label={label}
            {...aria}
            onKeyDown={onKeyDown}
            className={cn('num rounded-lg text-center tabular-nums text-ink', VALUE[size], ring)}
          >
            <span className="arc-nf-window">
              <span key={value} className="arc-nf-value" data-dir={dir ?? undefined}>{String(value)}</span>
            </span>
          </div>
        )}
        {renderBtn('inc')}
      </div>
      {note ? <p className="arc-nf-note mt-1 text-xs font-medium text-warning-fg">{note}</p> : null}
      <span aria-live="polite" className="sr-only">{announce}</span>
    </div>
  );
}
