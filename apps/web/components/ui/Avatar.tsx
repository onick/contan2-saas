import { cn } from './cn';

export interface AvatarProps {
  name: string;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

export function Avatar({ name, className }: AvatarProps) {
  return (
    <span
      aria-label={name}
      className={cn(
        'inline-grid h-9 w-9 flex-none place-items-center rounded-full bg-info-soft text-info-text text-[13px] font-semibold select-none',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
