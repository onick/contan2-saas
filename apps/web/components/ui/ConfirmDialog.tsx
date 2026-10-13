'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { cn, focusRing } from './cn';
import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  dismissOnOverlay?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  dismissOnOverlay = false,
}: ConfirmDialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="drawer-backdrop fixed inset-0 z-40 bg-ink/40" />
        <RadixDialog.Content
          className={cn(
            'drawer-panel fixed inset-x-4 top-[50%] z-50 max-w-md translate-y-[-50%] mx-auto',
            'rounded-card border border-line bg-surface shadow-xl p-6',
            'focus:outline-none',
          )}
          onPointerDownOutside={(e: { preventDefault: () => void }) => {
            if (!dismissOnOverlay) e.preventDefault();
          }}
        >
          <RadixDialog.Title className="text-[17px] font-semibold text-ink">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-2 text-[14px] text-muted">
              {description}
            </RadixDialog.Description>
          ) : null}
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="secondary" onClick={onClose}>
              {cancelLabel}
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              onClick={() => { onConfirm(); onClose(); }}
            >
              {confirmLabel}
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
