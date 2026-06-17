// components/identidad/PalettePresets.tsx · paletas predefinidas para arrancar
// rápido la identidad de un tenant. Cada chip aplica primario + acento de un clic;
// el que coincide con los colores actuales queda marcado. No persiste solo: setea
// el form (el editor deriva tonos/contraste y "Guardar" lo guarda).
'use client';

import { Check } from 'lucide-react';
import { cn, focusRing } from '../ui';

export interface Palette { name: string; primary: string; accent: string }

// CCB primero (marca ancla) + 5 alternativas para white-label.
export const PALETTES: Palette[] = [
  { name: 'Banreservas', primary: '#e65100', accent: '#ff6f00' },
  { name: 'Turquesa', primary: '#0182a2', accent: '#34b3d0' },
  { name: 'Índigo', primary: '#4338ca', accent: '#6366f1' },
  { name: 'Verde', primary: '#157f3c', accent: '#34a853' },
  { name: 'Carmín', primary: '#b3261e', accent: '#e2574c' },
  { name: 'Pizarra', primary: '#334155', accent: '#64748b' },
];

export function PalettePresets({ primary, accent, onPick, disabled }: {
  primary: string;
  accent: string;
  onPick: (p: Palette) => void;
  disabled?: boolean;
}) {
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return (
    <div className="flex flex-wrap gap-2.5">
      {PALETTES.map((p) => {
        const sel = eq(p.primary, primary) && eq(p.accent, accent);
        return (
          <button
            key={p.name}
            type="button"
            onClick={() => !disabled && onPick(p)}
            disabled={disabled}
            aria-label={`Paleta ${p.name}`}
            aria-pressed={sel}
            title={p.name}
            className={cn(
              'relative flex h-[46px] w-[46px] overflow-hidden rounded-xl border border-line',
              !disabled && 'cursor-pointer',
              sel && 'border-transparent outline outline-[2.5px] outline-brand outline-offset-2',
              focusRing,
            )}
          >
            <span className="block flex-1" style={{ backgroundColor: p.primary }} />
            <span className="block flex-1" style={{ backgroundColor: p.accent }} />
            {sel ? (
              <span className="absolute inset-0 grid place-items-center text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
                <Check size={16} strokeWidth={3} aria-hidden="true" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
