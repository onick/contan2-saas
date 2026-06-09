'use client';

// components/usuarios/RowActions.tsx · acciones rápidas por fila (F2E). Menú kebab
// SIEMPRE visible (no depende de hover), accesible (aria-haspopup/menu, Escape,
// click-fuera, tap targets ≥44px). Reutiliza los client fns y el drawer de perfil.
// Permisos: copiar/ver = todos; editar/reenviar/archivar = canWrite (owner/admin),
// pero la API es la autoridad (403 si corresponde). Confirmación + anti-doble-submit
// en reenviar/archivar/reactivar. Refresca el listado tras mutaciones (preserva URL).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { MoreVertical, Eye, Copy, Pencil, Send, Archive, ArchiveRestore, Loader2, Check } from 'lucide-react';
import { resendCredential, archiveUser, reactivateUser } from '../../lib/api/profile-client';
import { useProfileActions } from './ProfileProvider';
import { cn, focusRing } from '../ui';

export interface RowActionsProps {
  code: string;
  email: string | null;
  archived: boolean;
  canWrite: boolean;
}

type View = 'menu' | 'resend' | 'archive';
const maskEmail = (e: string) => { const at = e.indexOf('@'); return at <= 0 ? '***' : `${e.slice(0, 1)}***@${e.slice(at + 1)}`; };

export function RowActions({ code, email, archived, canWrite }: RowActionsProps) {
  const { open, openEdit } = useProfileActions();
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const resendKey = useRef('');

  function show() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    setView('menu'); setError(null); setOpenMenu(true);
  }
  function close() { setOpenMenu(false); setBusy(false); }

  useEffect(() => {
    if (!openMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); btnRef.current?.focus(); } };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown, true); };
  }, [openMenu, view]);

  async function copyCode() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* */ }
    close();
  }
  async function doResend() {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await resendCredential(code, resendKey.current); // misma key en reintentos
    setBusy(false);
    if (r.ok) { close(); router.refresh(); }
    else setError(r.error);
  }
  async function doArchive() {
    if (busy) return;
    setBusy(true); setError(null);
    const r = archived ? await reactivateUser(code) : await archiveUser(code);
    setBusy(false);
    if (r.ok) { close(); router.refresh(); }
    else setError(r.error);
  }

  const itemCls = cn('flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-[13px] text-ink hover:bg-page disabled:cursor-not-allowed disabled:opacity-50', focusRing);

  return (
    <>
      <div aria-live="polite" className="sr-only">{copied ? 'Código copiado al portapapeles' : ''}</div>
      <button
        ref={btnRef} type="button" aria-haspopup="menu" aria-expanded={openMenu}
        aria-label={`Acciones de ${code}`} onClick={() => (openMenu ? close() : show())}
        className={cn('grid h-9 w-9 place-items-center rounded-lg text-faint hover:bg-page hover:text-ink', focusRing)}
      >
        <MoreVertical size={18} strokeWidth={2} aria-hidden="true" />
      </button>

      {openMenu && typeof document !== 'undefined'
        ? createPortal(
          <div ref={menuRef} role="menu" aria-label={`Acciones de ${code}`}
            style={{ position: 'fixed', top: pos.top, right: pos.right }}
            className="z-[70] w-60 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-xl">
            {view === 'menu' ? (
              <>
                <button role="menuitem" type="button" className={itemCls} onClick={() => { close(); open(code); }}>
                  <Eye size={15} strokeWidth={2} aria-hidden="true" className="text-faint" /> Ver perfil
                </button>
                <button role="menuitem" type="button" className={itemCls} onClick={copyCode}>
                  {copied ? <Check size={15} strokeWidth={2.5} aria-hidden="true" className="text-success-fg" /> : <Copy size={15} strokeWidth={2} aria-hidden="true" className="text-faint" />} Copiar código
                </button>
                {canWrite ? (
                  <>
                    <div className="my-1 border-t border-line" />
                    <button role="menuitem" type="button" className={itemCls} onClick={() => { close(); openEdit(code); }}>
                      <Pencil size={15} strokeWidth={2} aria-hidden="true" className="text-faint" /> Editar usuario
                    </button>
                    <button role="menuitem" type="button" className={itemCls} disabled={!email}
                      aria-disabled={!email} title={!email ? 'El visitante no tiene email' : undefined}
                      onClick={() => { if (!email) return; resendKey.current = crypto.randomUUID(); setError(null); setView('resend'); }}>
                      <Send size={15} strokeWidth={2} aria-hidden="true" className="text-faint" />
                      {email ? 'Reenviar credencial' : 'Reenviar credencial (sin email)'}
                    </button>
                    <button role="menuitem" type="button" className={cn(itemCls, archived ? '' : 'text-danger-fg')} onClick={() => { setError(null); setView('archive'); }}>
                      {archived
                        ? <><ArchiveRestore size={15} strokeWidth={2} aria-hidden="true" /> Reactivar</>
                        : <><Archive size={15} strokeWidth={2} aria-hidden="true" /> Archivar</>}
                    </button>
                  </>
                ) : null}
              </>
            ) : view === 'resend' ? (
              <div className="p-3">
                <p className="text-[13px] text-ink">¿Reenviar la credencial a <strong className="font-semibold">{email ? maskEmail(email) : ''}</strong>?</p>
                {error ? <p role="alert" className="mt-2 text-[12px] text-danger-fg">{error}</p> : null}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button type="button" className={cn('rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-muted', focusRing)} onClick={() => setView('menu')} disabled={busy}>Cancelar</button>
                  <button type="button" className={cn('inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50', focusRing)} onClick={doResend} disabled={busy}>
                    {busy ? <><Loader2 size={14} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Enviando…</> : 'Sí, reenviar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3">
                <p className="text-[13px] text-ink">{archived ? '¿Reactivar a este visitante? Volverá al listado activo.' : '¿Archivar a este visitante? Se oculta del listado; su historial se preserva.'}</p>
                {error ? <p role="alert" className="mt-2 text-[12px] text-danger-fg">{error}</p> : null}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button type="button" className={cn('rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-muted', focusRing)} onClick={() => setView('menu')} disabled={busy}>Cancelar</button>
                  <button type="button" className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50', archived ? 'bg-brand' : 'bg-danger-fg', focusRing)} onClick={doArchive} disabled={busy}>
                    {busy ? <><Loader2 size={14} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> …</> : archived ? 'Sí, reactivar' : 'Sí, archivar'}
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
