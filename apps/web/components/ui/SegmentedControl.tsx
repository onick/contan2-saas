import Link from 'next/link';
import { cn } from './cn';

export interface SegmentedControlItem {
  label: string;
  href: string;
  active?: boolean;
}

export interface SegmentedControlProps {
  items: SegmentedControlItem[];
  className?: string;
}

export function SegmentedControl({ items, className }: SegmentedControlProps) {
  return (
    <nav
      aria-label="Segmentos"
      className={cn(
        'inline-flex rounded-pill border border-line p-[3px]',
        className,
      )}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors',
            item.active
              ? 'bg-ink text-white'
              : 'text-muted hover:text-ink',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
