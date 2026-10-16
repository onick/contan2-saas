import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Badge } from './Badge';

export interface StatTrend {
  value: string;
  dir: 'up' | 'down' | 'flat';
  hint?: string;
}

export interface StatCardProps {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  trend?: StatTrend;
  // Cifra secundaria opcional bajo el valor (p. ej. "3 registros").
  secondary?: string;
  className?: string;
}

const TREND_TONE = {
  up:   'success',
  down: 'danger',
  flat: 'neutral',
} as const;

export function StatCard({ icon: Icon, label, value, trend, secondary, className }: StatCardProps) {
  return (
    <section
      className={cn(
        'rounded-card border border-line bg-surface p-5 animate-entrar',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface-container text-muted">
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
        ) : null}
        <p className="text-[13px] font-medium leading-snug text-muted line-clamp-2">{label}</p>
      </div>
      <p className="num mt-3 text-[28px] font-semibold leading-none text-ink">{value}</p>
      {secondary ? <p className="mt-1 text-[12px] text-faint">{secondary}</p> : null}
      {trend ? (
        <div className="mt-2">
          <Badge tone={TREND_TONE[trend.dir]} className="text-[11px]">
            {trend.value}
            {trend.hint ? <span className="sr-only">{trend.hint}</span> : null}
          </Badge>
        </div>
      ) : null}
    </section>
  );
}
