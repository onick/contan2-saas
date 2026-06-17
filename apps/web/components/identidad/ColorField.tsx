// components/identidad/ColorField.tsx · selector de color visual (white-label).
// Muestra muestra + hex + botón "Editar" que abre un popover con el picker
// (react-colorful: cuadro saturación/brillo + barra de tono), input hex y, si el
// navegador lo soporta, cuentagotas (EyeDropper API). Controlado: value=#RRGGBB,
// onChange(hex en minúscula). La derivación de tonos/contraste vive en el editor.
'use client';

import { useEffect, useRef, useState } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { Pipette, Check } from 'lucide-react';
import { cn, focusRing } from '../ui';
import { isHex6 } from '../../lib/branding/contrast';

// EyeDropper API (Chromium). Tipado mínimo: no está en lib.dom de todos los TS.
interface EyeDropperCtor { new (): { open: () => Promise<{ sRGBHex: string }> } }

export function ColorField({ label, value, onChange, disabled }: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const valid = isHex6(value);
  const swatch = valid ? value : '#cccccc';

  // Cerrar al hacer clic afuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const set = (hex: string) => onChange(hex.toLowerCase());

  const pickEyedropper = async () => {
    const Ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (!Ctor) return;
    try { const r = await new Ctor().open(); set(r.sRGBHex); } catch { /* cancelado */ }
  };
  const hasEyedropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          aria-label={`Editar ${label}`}
          className={cn('h-11 w-11 flex-none rounded-xl border border-black/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]', !disabled && 'cursor-pointer', focusRing)}
          style={{ backgroundColor: swatch }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink">{label}</div>
          <div className={cn('font-mono text-[12.5px] uppercase', valid ? 'text-muted' : 'text-danger-fg')}>{value || '—'}</div>
        </div>
        <button
          type="button"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          className={cn('inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] font-semibold text-ink', !disabled && 'hover:bg-surface-container', focusRing)}
        >
          {open ? <><Check size={14} aria-hidden="true" /> Listo</> : 'Editar'}
        </button>
      </div>

      {open ? (
        <div className="absolute z-30 mt-2 w-[268px] rounded-2xl border border-line bg-surface p-3.5 shadow-[0_12px_34px_-18px_rgba(20,23,40,0.45)]">
          <HexColorPicker color={swatch} onChange={set} />
          <div className="mt-3 flex items-center gap-2">
            <span className="font-mono text-[13px] text-faint">#</span>
            <HexColorInput
              color={swatch}
              onChange={set}
              aria-label={`Hex de ${label}`}
              className={cn('min-h-10 flex-1 rounded-lg border bg-surface px-2.5 py-2 font-mono text-[13px] uppercase text-ink', valid ? 'border-line' : 'border-danger-fg', focusRing)}
            />
            {hasEyedropper ? (
              <button type="button" onClick={pickEyedropper} aria-label="Cuentagotas" title="Cuentagotas" className={cn('grid h-10 w-10 flex-none place-items-center rounded-lg border border-line text-muted hover:bg-surface-container', focusRing)}>
                <Pipette size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {!valid ? <p className="mt-1.5 text-[12px] text-danger-fg">Color hex #RRGGBB.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
