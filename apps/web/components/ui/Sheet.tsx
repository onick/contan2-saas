'use client';

import { type RefObject } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn, focusRing } from './cn';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissOnOverlay?: boolean;
  width?: number;
  className?: string;
  ariaLabel?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissOnOverlay = false,
  width = 560,
  className,
  ariaLabel,
  returnFocusRef,
}: SheetProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="drawer-backdrop fixed inset-0 z-40 bg-ink/40" />
        <RadixDialog.Content
          className={cn(
            // Mobile: panel inferior; md+: panel lateral derecho
            'drawer-panel fixed inset-x-0 bottom-0 z-50 max-h-[90dvh]',
            'md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none',
            'w-full md:w-[var(--sheet-width)] md:max-w-[100vw]',
            'rounded-t-card md:rounded-l-card md:rounded-r-none',
            'border border-line bg-surface shadow-xl',
            'flex flex-col',
            'focus:outline-none',
            className,
          )}
          style={{ ['--sheet-width' as string]: `${width}px` }}
          onPointerDownOutside={(e: { preventDefault: () => void }) => {
            if (!dismissOnOverlay) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            if (returnFocusRef?.current) {
              e.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
        >
          {title ? (
            <div className="flex items-start justify-between gap-4 border-b border-line p-5">
              <div className="min-w-0">
                <RadixDialog.Title className="text-[17px] font-semibold text-ink">
                  {title}
                </RadixDialog.Title>
                {description ? (
                  <RadixDialog.Description className="mt-0.5 text-[13px] text-muted">
                    {description}
                  </RadixDialog.Description>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={onClose}
                className={cn('flex-none text-muted hover:text-ink', focusRing, 'rounded-lg p-1')}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <RadixDialog.Title className="sr-only">{ariaLabel}</RadixDialog.Title>
          )}
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
          {footer ? (
            <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-4">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
