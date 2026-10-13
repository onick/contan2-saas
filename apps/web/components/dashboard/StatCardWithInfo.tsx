import { HelpCircle } from 'lucide-react';
import { StatCard, Popover, PopoverTrigger, PopoverContent, focusRing, cn, type StatCardProps } from '../ui';

interface Props extends Omit<StatCardProps, 'className'> {
  tooltipText: string;
  className?: string;
}

export function StatCardWithInfo({ tooltipText, className, ...props }: Props) {
  return (
    <div className={className ? `relative ${className}` : 'relative'}>
      <StatCard {...props} />
      <Popover>
        <PopoverTrigger asChild>
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
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={6}
          className="z-50 max-w-[260px] rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-lg text-[12px] leading-relaxed text-ink"
        >
          {tooltipText}
        </PopoverContent>
      </Popover>
    </div>
  );
}
