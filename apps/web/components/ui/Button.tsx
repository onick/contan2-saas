import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn, focusRing } from './cn';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center font-semibold transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    focusRing,
  ],
  {
    variants: {
      variant: {
        primary: 'rounded-pill bg-brand text-brand-fg shadow-sm hover:brightness-95 active:brightness-90',
        secondary: 'rounded-pill border border-line bg-surface text-ink hover:bg-subtle',
        ghost: 'rounded-pill text-muted hover:bg-surface-container hover:text-ink',
        destructive: 'rounded-pill bg-danger-fg text-white hover:brightness-95 active:brightness-90',
        link: 'rounded-pill text-brand-text underline-offset-4 hover:underline',
        // pill = botón de alternancia: seleccionado → bg-ink text-white; no seleccionado → como secondary
        pill: 'rounded-pill border border-line bg-surface text-ink hover:bg-subtle',
      },
      size: {
        sm: 'min-h-8 gap-1.5 px-3 text-[13px]',
        md: 'min-h-11 md:min-h-10 gap-1.5 px-4 text-sm',
        lg: 'min-h-12 gap-1.5 px-5 text-sm',
        icon: 'h-10 w-10',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

export interface ButtonProps
  extends Omit<ComponentProps<'button'>, 'children'>,
    VariantProps<typeof buttonVariants> {
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  // Only for variant="pill": active toggle state.
  selected?: boolean;
  children?: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  selected = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const isPill = variant === 'pill';
  const pillSelected = isPill && selected;
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

  return (
    <button
      type={type}
      aria-pressed={isPill ? selected : undefined}
      data-variant={variant}
      data-size={size ?? 'md'}
      data-selected={isPill ? String(selected) : undefined}
      className={cn(
        buttonVariants({ variant, size, fullWidth }),
        pillSelected && 'bg-ink text-white border-ink hover:bg-ink',
        className,
      )}
      {...rest}
    >
      {loading
        ? <Loader2 size={iconSize} className="animate-spin" aria-hidden="true" />
        : Icon
          ? <Icon size={iconSize} aria-hidden="true" />
          : null}
      {children}
      {!loading && IconRight ? <IconRight size={iconSize} aria-hidden="true" /> : null}
    </button>
  );
}
