'use client';

import { type RefObject } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Loader2 } from 'lucide-react';
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
  /** Muestra estado de carga; deshabilita botones. Cuando está definido, el diálogo
   *  no se cierra solo al confirmar — el padre llama onClose() al terminar. */
  busy?: boolean;
  /** Error ocurrido tras confirmar; se mantiene abierto para reintentar. */
  error?: string | null;
  returnFocusRef?: RefObject<HTMLElement | null>;
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
  busy,
  error,
  returnFocusRef,
}: ConfirmDialogProps) {
  const controlled = busy !== undefined || error !== undefined;
  return (
    <RadixDialog.Root open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="drawer-backdrop fixed inset-0 z-40 bg-ink/40" />
        <RadixDialog.Content
          className={cn(
            'drawer-panel fixed inset-x-4 top-[50%] z-50 max-w-md translate-y-[-50%] mx-auto',
            'rounded-panel border border-line bg-surface shadow-xl p-6',
            'focus:outline-none',
          )}
          onPointerDownOutside={(e: { preventDefault: () => void }) => {
            if (!dismissOnOverlay || busy) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            if (returnFocusRef?.current) {
              e.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
        >
          <RadixDialog.Title className="text-[17px] font-semibold text-ink">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-2 text-[14px] text-muted">
              {description}
            </RadixDialog.Description>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              disabled={busy}
              onClick={() => {
                onConfirm();
                if (!controlled) onClose();
              }}
            >
              {busy ? (
                <><Loader2 size={15} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> {confirmLabel}…</>
              ) : confirmLabel}
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
