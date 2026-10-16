'use client';

// Portado de arc-library (https://github.com/kuratlielia/arc-library) · MIT © 2026 Elia Kuratli.
// Origen: registry/components/otp-input/otp-input.tsx @ b40c890 (2026-10-16). Adaptado a contan2: Tailwind v4 +
// tokens de marca por tenant, sin `motion` (CSS + prefers-reduced-motion), es-DO. Ver ../ATTRIBUTION.md.
//
// Adaptación principal: en vez de N inputs de un carácter (Arc), un ÚNICO <input> transparente
// superpuesto a casillas visuales `aria-hidden`. El PIN tiene longitud variable (4 a 8), el lector de
// pantalla encuentra un solo campo y el pegado/autocompletado nativos siguen funcionando.

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent } from 'react';

// Sin `cn` (clsx + tailwind-merge): /scanner es mobile-first y ese par pesa ~9 KB gz. Aquí no hay clases en conflicto.
const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Etiqueta accesible exacta del input (p. ej. 'PIN del centro'). */
  label: string;
  /** Mínimo de casillas visibles. */
  minLength?: number;
  /** Tope de dígitos (atributo `maxLength` y número máximo de casillas). */
  maxLength?: number;
  /** Muestra '•' en vez del dígito. */
  masked?: boolean;
  /** Con `masked`: el último dígito tecleado se ve ~0,7 s antes de ocultarse. */
  revealLast?: boolean;
  /** Hay un error: pinta las casillas en rojo y sacude una vez. */
  error?: boolean;
  /** id del elemento que describe el error (se enlaza con aria-describedby). */
  errorId?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Longitud conocida del código: al alcanzarla se llama a `onComplete`. */
  completeLength?: number | null;
  onComplete?: (value: string) => void;
  className?: string;
}

const digits = (s: string) => s.replace(/\D/g, '');

export function OtpInput({
  value,
  onChange,
  label,
  minLength = 4,
  maxLength = 8,
  masked = true,
  revealLast = false,
  error = false,
  errorId,
  autoFocus = false,
  disabled = false,
  completeLength = null,
  onComplete,
  className,
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [shake, setShake] = useState(false);

  const [revealIdx, setRevealIdx] = useState(-1);
  const prevLen = useRef(value.length);

  // Un error nuevo sacude las casillas una vez y devuelve el foco al campo (select vacía el PIN viejo, si lo hay).
  useEffect(() => {
    if (!error) {
      setShake(false);
      return;
    }
    setShake(true);
    const el = inputRef.current;
    if (el && !el.disabled) {
      el.focus();
      el.select();
    }
  }, [error]);

  // revealLast: muestra brevemente el dígito recién tecleado.
  useEffect(() => {
    const grew = value.length > prevLen.current;
    prevLen.current = value.length;
    if (!masked || !revealLast || !grew) {
      setRevealIdx(-1);
      return;
    }
    setRevealIdx(value.length - 1);
    const id = setTimeout(() => setRevealIdx(-1), 700);
    return () => clearTimeout(id);
  }, [value, masked, revealLast]);

  function commit(raw: string) {
    const next = digits(raw).slice(0, maxLength);
    onChange(next);
    if (completeLength && next.length === completeLength && next !== value) onComplete?.(next);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    commit(e.target.value);
  }

  // El navegador recortaría "1234 5678" a 8 caracteres CON el espacio; sanitizamos antes de insertar.
  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    commit(value.slice(0, start) + text + value.slice(end));
  }

  const count = Math.min(maxLength, Math.max(minLength, value.length + 1));
  const activeIndex = focused && !disabled ? Math.min(value.length, maxLength - 1) : -1;

  return (
    <div
      className={cn('arc-otp relative mx-auto w-fit max-w-full', className)}
      data-shake={shake ? 'true' : undefined}
      data-invalid={error ? 'true' : undefined}
    >
      <div className="arc-otp-slots flex justify-center gap-2" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => {
          const filled = i < value.length;
          const active = i === activeIndex;
          return (
            <span
              key={i}
              data-filled={filled ? 'true' : undefined}
              data-active={active ? 'true' : undefined}
              className={cn(
                'arc-otp-slot flex h-12 w-10 items-center justify-center rounded-field border text-lg font-bold tabular-nums',
                error
                  ? 'border-danger-fg bg-danger-bg text-danger-fg'
                  : filled
                    ? 'border-brand-strong bg-brand-soft text-brand-text'
                    : 'border-border-strong bg-surface text-transparent',
                active && 'ring-2 ring-focus',
              )}
            >
              {filled ? (
                <span key={`${i}:${value[i]}`} className="arc-otp-glyph">
                  {masked && i !== revealIdx ? '•' : value[i]}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={maxLength}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="absolute inset-0 h-12 w-full cursor-text bg-transparent text-base text-transparent caret-transparent outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}
