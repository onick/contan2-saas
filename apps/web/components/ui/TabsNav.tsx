import Link from 'next/link';
import { cn } from './cn';

export interface TabNavItem {
  label: string;
  href: string;
  active?: boolean;
}

export interface TabsNavProps {
  items: TabNavItem[];
  className?: string;
}

export function TabsNav({ items, className }: TabsNavProps) {
  return (
    <nav
      aria-label="Pestañas"
      className={cn('overflow-x-auto [scroll-snap-type:x_mandatory]', className)}
    >
      <div className="flex min-w-max border-b border-line">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors [scroll-snap-align:start]',
              'border-b-2 border-transparent',
              item.active
                ? 'border-brand-text text-ink'
                : 'text-muted hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
