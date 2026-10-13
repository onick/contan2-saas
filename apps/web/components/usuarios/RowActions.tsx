'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Eye, Copy, Pencil, Send, Archive, ArchiveRestore, Check } from 'lucide-react';
import { resendCredential, archiveUser, reactivateUser } from '../../lib/api/profile-client';
import { useProfileActions } from './ProfileProvider';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, ConfirmDialog,
  cn, focusRing,
} from '../ui';

export interface RowActionsProps {
  code: string;
  name: string;
  email: string | null;
  archived: boolean;
  canWrite: boolean;
}

const maskEmail = (e: string) => {
  const at = e.indexOf('@');
  return at <= 0 ? '***' : `${e.slice(0, 1)}***@${e.slice(at + 1)}`;
};

export function RowActions({ code, name, email, archived, canWrite }: RowActionsProps) {
  const { open, openEdit } = useProfileActions();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const resendKey = useRef('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* */ }
  }

  async function doResend() {
    if (busy) return;
    setBusy(true);
    setResendError(null);
    const r = await resendCredential(code, resendKey.current);
    setBusy(false);
    if (r.ok) { setShowResend(false); router.refresh(); }
    else setResendError(r.error);
  }

  async function doArchive() {
    if (busy) return;
    setBusy(true);
    setArchiveError(null);
    const r = archived ? await reactivateUser(code) : await archiveUser(code);
    setBusy(false);
    if (r.ok) { setShowArchive(false); router.refresh(); }
    else setArchiveError(r.error);
  }

  return (
    <>
      <div aria-live="polite" className="sr-only">{copied ? 'Código copiado al portapapeles' : ''}</div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Acciones para ${name}`}
            className={cn('grid h-9 w-9 place-items-center rounded-lg text-faint hover:bg-page hover:text-ink', focusRing)}
          >
            <MoreHorizontal size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem icon={Eye} onSelect={() => open(code)}>
            Ver perfil
          </DropdownMenuItem>
          <DropdownMenuItem icon={copied ? Check : Copy} onSelect={() => void copyCode()}>
            Copiar código
          </DropdownMenuItem>
          {canWrite ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={Pencil} onSelect={() => openEdit(code)}>
                Editar usuario
              </DropdownMenuItem>
              <DropdownMenuItem
                icon={Send}
                disabled={!email}
                title={!email ? 'El visitante no tiene email' : undefined}
                onSelect={() => {
                  if (!email) return;
                  resendKey.current = crypto.randomUUID();
                  setShowResend(true);
                }}
              >
                {email ? 'Reenviar credencial' : 'Reenviar credencial (sin email)'}
              </DropdownMenuItem>
              <DropdownMenuItem
                icon={archived ? ArchiveRestore : Archive}
                destructive={!archived}
                onSelect={() => setShowArchive(true)}
              >
                {archived ? 'Reactivar' : 'Archivar'}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={showResend}
        onClose={() => { setShowResend(false); setResendError(null); }}
        onConfirm={() => void doResend()}
        title="Reenviar credencial"
        description={email ? `¿Reenviar la credencial a ${maskEmail(email)}?` : ''}
        confirmLabel="Sí, reenviar"
        busy={busy}
        error={resendError}
        returnFocusRef={triggerRef}
      />

      <ConfirmDialog
        open={showArchive}
        onClose={() => { setShowArchive(false); setArchiveError(null); }}
        onConfirm={() => void doArchive()}
        title={archived ? 'Reactivar usuario' : 'Archivar usuario'}
        description={
          archived
            ? '¿Reactivar a este visitante? Volverá al listado activo.'
            : '¿Archivar a este visitante? Se oculta del listado; su historial se preserva.'
        }
        confirmLabel={archived ? 'Sí, reactivar' : 'Sí, archivar'}
        destructive={!archived}
        busy={busy}
        error={archiveError}
        returnFocusRef={triggerRef}
      />
    </>
  );
}
