import type { ComponentProps } from 'react';
import { cn, focusRing } from '../ui';
import { DOOR_FILL } from './salaColors';

// Botón primario de la PUERTA: relleno de marca del tenant (bg-brand) con el texto
// derivado por contraste (text-brand-fg, AA), igual que el Button del kit. Nunca
// texto blanco sobre el naranja (2,35:1, PUE-A05). Targets de 44 px en todos los
// tamaños (la puerta se opera en una tablet), foco visible y hover que aclara.

type Size = 'sm' | 'md' | 'lg';
const SIZES: Record<Size, string> = {
  sm: 'min-h-11 gap-1.5 px-3.5 text-[13px]',
  md: 'min-h-11 gap-2 px-4 text-sm',
  lg: 'min-h-12 gap-2 px-5 text-[15px]',
};

// Identidad por sala: Ada = marca del tenant; Sala VR y su agenda = azul secundario
// derivado (info-text, 4,78:1 con blanco; ver salaColors.ts).
export type DoorTone = 'brand' | 'vr';
const TONES: Record<DoorTone, string> = {
  brand: DOOR_FILL.brand,
  vr: DOOR_FILL.vr,
};

export interface DoorButtonProps extends ComponentProps<'button'> {
  size?: Size;
  tone?: DoorTone;
}

export function DoorButton({ size = 'md', tone = 'brand', className, type = 'button', ...rest }: DoorButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-xl font-bold shadow-sm transition',
        'hover:brightness-[1.07] active:brightness-95 disabled:pointer-events-none disabled:opacity-50',
        TONES[tone],
        focusRing,
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}
