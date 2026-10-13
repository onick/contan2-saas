import type { ComponentProps } from 'react';
import { cn } from './cn';

export type ChipTone = 'neutral' | 'success' | 'danger' | 'warning' | 'brand';

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-surface-container text-muted',
  success: 'bg-success-bg text-success-fg',
  danger:  'bg-danger-bg text-danger-fg',
  warning: 'bg-warning-bg text-warning-fg',
  brand:   'bg-brand-soft text-brand-text',
};

const DOTS: Record<ChipTone, string> = {
  neutral: 'bg-muted',
  success: 'bg-success-fg',
  danger:  'bg-danger-fg',
  warning: 'bg-warning-fg',
  brand:   'bg-brand',
};

export interface ChipProps extends ComponentProps<'span'> {
  tone?: ChipTone;
  dot?: boolean;
}

export function Chip({ tone = 'neutral', dot = false, className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-[11px] font-semibold',
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
