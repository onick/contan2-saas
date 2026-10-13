'use client';

import { cn } from './cn';

export interface SegmentedControlClientItem {
  label: string;
  value: string;
}

export interface SegmentedControlClientProps {
  items: SegmentedControlClientItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SegmentedControlClient({ items, value, onChange, className }: SegmentedControlClientProps) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex rounded-pill border border-line p-[3px]',
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={item.value === value}
          onClick={() => onChange(item.value)}
          className={cn(
            'rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors',
            item.value === value
              ? 'bg-ink text-white'
              : 'text-muted hover:text-ink',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
