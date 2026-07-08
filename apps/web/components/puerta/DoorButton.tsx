import type { ComponentProps } from 'react';
import { cn, focusRing } from '../ui';

// Botón primario de la PUERTA con el naranja de marca #e65100 (bg-brand),
// consistente con el kiosko ("Toca para registrarte") — la puerta es una
// superficie kiosko-adjacente. (El kit usa brand-strong #c44400 para el admin
// general; acá el usuario pidió el naranja del kiosko.) Mantiene el foco visible
// y los touch targets del kit; el hover aclara como en el kiosko.

type Size = 'sm' | 'md' | 'lg';
const SIZES: Record<Size, string> = {
  sm: 'min-h-9 gap-1.5 px-3 text-[13px]',
  md: 'min-h-11 gap-2 px-4 text-sm',
  lg: 'min-h-12 gap-2 px-5 text-[15px]',
};

export interface DoorButtonProps extends ComponentProps<'button'> {
  size?: Size;
}

export function DoorButton({ size = 'md', className, type = 'button', ...rest }: DoorButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-xl bg-brand font-bold text-white shadow-sm transition',
        'hover:brightness-[1.07] active:brightness-95 disabled:pointer-events-none disabled:opacity-50',
        focusRing,
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}
