'use client';

import { type RefObject } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn, focusRing } from './cn';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissOnOverlay?: boolean;
  className?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissOnOverlay = false,
  className,
  returnFocusRef,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="drawer-backdrop fixed inset-0 z-40 bg-ink/40" />
        <RadixDialog.Content
          className={cn(
            'drawer-panel fixed inset-x-4 top-[50%] z-50 max-w-lg translate-y-[-50%] mx-auto',
            'rounded-card border border-line bg-surface shadow-xl',
            'focus:outline-none',
            className,
          )}
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
          ) : null}
          <div className="p-5">{children}</div>
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
