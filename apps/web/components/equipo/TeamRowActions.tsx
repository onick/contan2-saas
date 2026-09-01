'use client';

// components/equipo/TeamRowActions.tsx · menú de acciones por fila del equipo
// (cambiar rol / activar-suspender). Gateado en la UI (los invariantes REALES los
// aplica api-v2): no se muestra sobre uno mismo, ni sobre un owner si el actor no
// es owner; un admin no puede ofrecer el rol owner. Cada acción pide confirmación.
// Menú en portal (fixed desde el rect del botón) para escapar el overflow de la tabla.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Loader2, ShieldCheck, UserCog, Ban, RotateCcw } from 'lucide-react';
import { IconButton, cn, focusRing } from '../ui';
import { changeTeamRole, changeTeamStatus } from '../../lib/api/team-client';

interface Props {
  member: { id: string; fullName: string; role: string; status: string };
  currentStaffId: string;
  currentRole: string;
  onChanged: () => void; // recargar la lista tras una acción
}

const ROLE_LABEL: Record<string, string> = { owner: 'Propietario', admin: 'Administrador', operator: 'Operador', protocolo: 'Protocolo', consulta: 'Consulta', puerta: 'Puerta', biblioteca: 'Biblioteca' };
const ALL_ROLES = ['operator', 'puerta', 'biblioteca', 'protocolo', 'admin', 'owner'] as const;

type View =
  | { kind: 'menu' }
  | { kind: 'confirm-role'; role: string }
  | { kind: 'confirm-status'; status: 'active' | 'suspended' };

export function TeamRowActions({ member, currentStaffId, currentRole, onChanged }: Props) {
  const btnRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [view, setView] = useState<View>({ kind: 'menu' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gating de UI (api-v2 es el árbitro real).
  const isSelf = member.id === currentStaffId;
  const targetIsOwner = member.role === 'owner';
  const canManage = (currentRole === 'owner' || currentRole === 'admin') && !isSelf && !(targetIsOwner && currentRole !== 'owner');
  // Roles asignables: distintos al actual; owner sólo si el actor es owner.
  const roleOptions = ALL_ROLES.filter((r) => r !== member.role && (r !== 'owner' || currentRole === 'owner'));

  const close = useCallback(() => { setOpen(false); setView({ kind: 'menu' }); setError(null); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if ((t as HTMLElement).closest?.('[data-team-menu]')) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open, close]);

  if (!canManage) return null;

  const toggle = () => {
    if (open) { close(); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    setView({ kind: 'menu' });
    setError(null);
    setOpen(true);
  };

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) { close(); onChanged(); }
    else setError(r.error ?? 'No se pudo completar la acción.');
  }

  const itemCls = cn('flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-container', focusRing);

  return (
    <>
      <span ref={btnRef} className="inline-flex">
        <IconButton label={`Acciones de ${member.fullName}`} variant="ghost" size="sm" onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
          <MoreVertical size={16} strokeWidth={2} aria-hidden="true" />
        </IconButton>
      </span>
      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div data-team-menu role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right }}
              className="z-[80] w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
              {error ? <p role="alert" className="border-b border-line bg-danger-bg px-3 py-2 text-[12px] text-danger-fg">{error}</p> : null}

              {view.kind === 'menu' ? (
                <div className="py-1">
                  {roleOptions.map((r) => (
                    <button key={r} type="button" className={itemCls} onClick={() => setView({ kind: 'confirm-role', role: r })}>
                      {r === 'owner' ? <ShieldCheck size={15} aria-hidden="true" className="text-faint" /> : <UserCog size={15} aria-hidden="true" className="text-faint" />}
                      Hacer {ROLE_LABEL[r]}
                    </button>
                  ))}
                  {member.status === 'active' ? (
                    <button type="button" className={cn(itemCls, 'text-danger-fg')} onClick={() => setView({ kind: 'confirm-status', status: 'suspended' })}>
                      <Ban size={15} aria-hidden="true" /> Suspender
                    </button>
                  ) : (
                    <button type="button" className={itemCls} onClick={() => setView({ kind: 'confirm-status', status: 'active' })}>
                      <RotateCcw size={15} aria-hidden="true" className="text-faint" /> Reactivar
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-3">
                  <p className="text-[13px] text-ink">
                    {view.kind === 'confirm-role'
                      ? <>¿Cambiar el rol de <span className="font-semibold">{member.fullName}</span> a <span className="font-semibold">{ROLE_LABEL[view.role]}</span>?</>
                      : view.status === 'suspended'
                        ? <>¿Suspender a <span className="font-semibold">{member.fullName}</span>? Se cerrarán sus sesiones.</>
                        : <>¿Reactivar a <span className="font-semibold">{member.fullName}</span>?</>}
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" className={cn('rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-muted hover:bg-surface-container', focusRing)} onClick={() => setView({ kind: 'menu' })} disabled={busy}>Cancelar</button>
                    <button type="button"
                      className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-white', view.kind === 'confirm-status' && view.status === 'suspended' ? 'bg-danger-fg' : 'bg-brand-strong', focusRing)}
                      onClick={() => run(() => view.kind === 'confirm-role' ? changeTeamRole(member.id, view.role) : changeTeamStatus(member.id, view.status))}
                      disabled={busy}>
                      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null} Confirmar
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
