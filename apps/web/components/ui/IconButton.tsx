import type { ComponentProps } from 'react';
import { cn, focusRing } from './cn';

export type IconButtonVariant = 'ghost' | 'outline';
export type IconButtonSize = 'md' | 'sm';

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: 'text-faint hover:bg-surface-container hover:text-muted',
  outline: 'border border-line text-muted hover:bg-surface-container hover:text-ink',
};

// md = 44×44 (touch target). sm (36px) solo para paginación/toolbars de DESKTOP.
const SIZES: Record<IconButtonSize, string> = {
  md: 'h-11 w-11',
  sm: 'h-9 w-9',
};

export interface IconButtonProps extends ComponentProps<'button'> {
  // Obligatorio: un botón de solo-ícono necesita nombre accesible.
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'grid flex-none place-items-center rounded-lg transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        focusRing,
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
