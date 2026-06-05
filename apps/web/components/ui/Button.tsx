import type { ComponentProps } from 'react';
import { cn, focusRing } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'pill';
export type ButtonSize = 'md' | 'sm' | 'lg';

// primary usa brand-strong (#c44400) para que el texto blanco cumpla WCAG AA en
// TODOS los tamaños: blanco/#c44400 = 5.03:1 (≥4.5:1, texto normal). El naranja
// de marca #e65100 NO se usa de relleno con texto blanco (3.79:1 < 4.5:1; 14px
// bold NO es "texto grande" — WCAG exige ~18.66px bold). El hover OSCURECE
// (brightness-95 = 4.88:1) en vez de bajar opacidad (opacity-90 componía sobre la
// página y caía a 4.31:1 < 4.5). active = brightness-90 (4.79:1). secondary y
// ghost para menor jerarquía. `pill` (filtros toggle) mantiene brand-strong.
const VARIANTS: Record<Exclude<ButtonVariant, 'pill'>, string> = {
  primary: 'bg-brand-strong text-white shadow-sm hover:brightness-95 active:brightness-90',
  secondary: 'border border-line bg-surface text-muted hover:bg-page hover:text-ink',
  ghost: 'text-muted hover:bg-surface-container hover:text-ink',
};

// md = 44px de alto (touch target). sm (36px) es para toolbars densas de
// DESKTOP (pointer primario); no usar en superficies táctiles. lg (48px) para
// acciones principales en superficies táctiles (check-in/kiosko, tablet-first).
const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-11 gap-2 px-4 text-sm',
  sm: 'min-h-9 gap-1.5 px-3 text-[13px]',
  lg: 'min-h-12 gap-2 px-5 text-sm',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // Solo para variant="pill": estado activo del filtro (fija aria-pressed).
  selected?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  selected = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isPill = variant === 'pill';
  const variantCls = isPill
    ? selected
      ? 'bg-brand-strong text-white'
      : 'bg-surface-container text-muted hover:text-ink'
    : VARIANTS[variant];
  return (
    <button
      type={type}
      aria-pressed={isPill ? selected : undefined}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-colors',
        isPill ? 'rounded-full' : 'rounded-[10px]',
        'disabled:pointer-events-none disabled:opacity-50',
        focusRing,
        SIZES[size],
        variantCls,
        className,
      )}
      {...rest}
    />
  );
}
