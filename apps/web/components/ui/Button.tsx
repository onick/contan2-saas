import type { ComponentProps } from 'react';
import { cn, focusRing } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

// primary usa brand-strong (texto blanco AA); el acento brand queda para
// links/íconos. secondary y ghost para acciones de menor jerarquía.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-strong text-white shadow-sm hover:opacity-90',
  secondary: 'border border-line bg-surface text-muted hover:bg-page hover:text-ink',
  ghost: 'text-muted hover:bg-surface-container hover:text-ink',
};

// md = 44px de alto (touch target). sm (36px) es para toolbars densas de
// DESKTOP (pointer primario); no usar en superficies táctiles.
const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-11 gap-2 px-4 text-sm',
  sm: 'min-h-9 gap-1.5 px-3 text-[13px]',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-[10px] font-semibold transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        focusRing,
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}
