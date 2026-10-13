import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'brand';

const TONE_CLS: Record<BadgeTone, string> = {
  neutral:  'bg-surface-container text-muted',
  success:  'bg-success-bg text-success-fg',
  danger:   'bg-danger-bg text-danger-fg',
  warning:  'bg-warning-bg text-warning-fg',
  info:     'bg-info-soft text-info-text',
  brand:    'bg-brand-soft text-brand-text',
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ tone = 'neutral', icon: Icon, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold',
        TONE_CLS[tone],
        className,
      )}
    >
      {Icon ? <Icon size={11} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
