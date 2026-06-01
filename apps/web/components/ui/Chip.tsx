import type { ComponentProps } from 'react';
import { cn } from './cn';

export type ChipTone = 'neutral' | 'success' | 'danger' | 'warning' | 'brand';

// Tonos = los que ya usan las pantallas (status/rol/badge). warning conserva el
// #b35400 sobre accent-soft de v1. Presentacional (span); para filtros
// interactivos usar <Button> pill, no Chip.
const TONES: Record<ChipTone, string> = {
  neutral: 'bg-surface-container text-muted',
  success: 'bg-success-bg text-success-fg',
  danger: 'bg-danger-bg text-danger-fg',
  warning: 'bg-accent-soft text-[#b35400]',
  brand: 'bg-primary-container text-on-primary-container',
};

const DOTS: Record<ChipTone, string> = {
  neutral: 'bg-[#9aa0ad]',
  success: 'bg-success-fg',
  danger: 'bg-danger-fg',
  warning: 'bg-brand-accent',
  brand: 'bg-brand',
};

export interface ChipProps extends ComponentProps<'span'> {
  tone?: ChipTone;
  dot?: boolean;
}

export function Chip({ tone = 'neutral', dot = false, className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span className={cn('h-[7px] w-[7px] flex-none rounded-full', DOTS[tone])} /> : null}
      {children}
    </span>
  );
}
