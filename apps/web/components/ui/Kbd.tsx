import { cn } from './cn';

export interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center rounded-field border border-line bg-surface-container px-1.5 py-0.5 font-mono text-[11px] text-muted shadow-sm',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
