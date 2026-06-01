import type { ComponentProps } from 'react';
import { cn, focusRing } from './cn';

export interface FieldProps extends ComponentProps<'input'> {
  label: string;
  hint?: string;
  mono?: boolean;
}

// Campo uncontrolled (defaultValue) → Server Component, mantiene Static. El
// foco visible reemplaza el outline-none suelto que tenían los inputs.
export function Field({ label, hint, mono = false, className, ...rest }: FieldProps) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      <input
        className={cn(
          'mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink',
          focusRing,
          mono && 'font-mono tabular-nums',
          className,
        )}
        {...rest}
      />
      {hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}
