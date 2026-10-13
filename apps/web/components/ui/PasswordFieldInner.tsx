'use client';

import { useState } from 'react';
import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';
import { cn, focusWithin, focusRing } from './cn';

interface PasswordFieldInnerProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: string;
  hint?: string;
  mono?: boolean;
  leadingIcon?: LucideIcon;
  wrapperClassName?: string;
}

export function PasswordFieldInner({
  label,
  hint,
  mono = false,
  leadingIcon: LeadingIcon,
  wrapperClassName,
  ...rest
}: PasswordFieldInnerProps) {
  const [show, setShow] = useState(false);

  return (
    <label className={cn('block', wrapperClassName)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      <div className={cn('mt-1 flex min-h-11 md:min-h-10 items-center rounded-field border border-border-strong bg-surface px-3', focusWithin, LeadingIcon && 'gap-2')}>
        {LeadingIcon ? <LeadingIcon size={16} className="flex-none text-muted" aria-hidden="true" /> : null}
        <input
          type={show ? 'text' : 'password'}
          className={cn('min-w-0 flex-1 bg-transparent py-2 text-[14px] text-ink outline-none placeholder:text-faint', mono && 'font-mono tabular-nums')}
          {...rest}
        />
        <button
          type="button"
          aria-pressed={show}
          aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onClick={() => setShow((v) => !v)}
          className={cn('flex-none text-muted hover:text-ink', focusRing)}
        >
          {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>
      {hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}
