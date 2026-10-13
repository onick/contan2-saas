import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn, focusWithin } from './cn';
import { PasswordFieldInner } from './PasswordFieldInner';

export interface FieldProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: string;
  hint?: string;
  mono?: boolean;
  leadingIcon?: LucideIcon;
  type?: ComponentProps<'input'>['type'];
}

export function Field({ label, hint, mono = false, leadingIcon: LeadingIcon, type, className, ...rest }: FieldProps) {
  if (type === 'password') {
    return (
      <PasswordFieldInner
        label={label}
        hint={hint}
        mono={mono}
        leadingIcon={LeadingIcon}
        wrapperClassName={className}
        {...rest}
      />
    );
  }

  return (
    <label className={cn('block', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      <div
        className={cn(
          'mt-1 flex min-h-11 md:min-h-10 items-center rounded-field border border-line bg-surface px-3',
          focusWithin,
          LeadingIcon && 'gap-2',
        )}
      >
        {LeadingIcon ? (
          <LeadingIcon size={16} className="flex-none text-muted" aria-hidden="true" />
        ) : null}
        <input
          type={type}
          className={cn(
            'min-w-0 flex-1 bg-transparent py-2 text-[14px] text-ink outline-none placeholder:text-faint',
            mono && 'font-mono tabular-nums',
          )}
          {...rest}
        />
      </div>
      {hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}
