import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn, focusWithin } from './cn';

export interface InputProps extends ComponentProps<'input'> {
  leadingIcon?: LucideIcon;
}

export function Input({ leadingIcon: LeadingIcon, className, ...rest }: InputProps) {
  return (
    <div
      className={cn(
        'flex items-center min-h-11 md:min-h-10 rounded-field border border-line bg-surface px-3',
        focusWithin,
        LeadingIcon && 'gap-2',
        className,
      )}
    >
      {LeadingIcon ? (
        <LeadingIcon size={16} className="flex-none text-muted" aria-hidden="true" />
      ) : null}
      <input
        className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
        {...rest}
      />
    </div>
  );
}
