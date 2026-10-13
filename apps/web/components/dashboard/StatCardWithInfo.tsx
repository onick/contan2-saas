import { HelpCircle } from 'lucide-react';
import { StatCard, Tooltip, focusRing, cn, type StatCardProps } from '../ui';

interface Props extends Omit<StatCardProps, 'className'> {
  tooltipText: string;
  className?: string;
}

export function StatCardWithInfo({ tooltipText, className, ...props }: Props) {
  return (
    <div className={className ? `relative ${className}` : 'relative'}>
      <StatCard {...props} />
      <Tooltip
        content={
          <span className="block max-w-[240px] text-[12px] leading-relaxed">
            {tooltipText}
          </span>
        }
        side="top"
      >
        <button
          type="button"
          aria-label="¿Cómo se calcula?"
          className={cn(
            'absolute right-3.5 top-3.5 p-1.5 text-faint transition-colors hover:text-muted',
            focusRing,
          )}
        >
          <HelpCircle size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}
