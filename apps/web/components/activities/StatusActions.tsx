'use client';

// apps/web/components/activities/StatusActions.tsx · acciones de estado de una
// actividad (Lifecycle B): Finalizar / Cancelar / Reactivar, según la matriz de
// transiciones (espejo de api-v2; la API es la autoridad y arbitra con 409). Cada
// acción exige confirmación explícita en un diálogo accesible. Idempotencia: el
// server devuelve 200 si el estado ya es el pedido — acá no ofrecemos la
// transición al mismo estado, pero un 200 siempre se trata como éxito.
//
// Cancelar NO envía correos y NO borra (se puede reactivar). Reactivar se permite
// aunque la fecha haya pasado. Sin DELETE. Sin botones inertes: sólo se muestran
// las transiciones válidas del estado actual.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, RotateCcw, Loader2, AlertTriangle, MoreHorizontal } from 'lucide-react';
import { Button, IconButton, cn, focusRing } from '../ui';

export type RawStatus = 'activa' | 'finalizada' | 'cancelada';

export interface ActionDef {
  key: 'finalizar' | 'cancelar' | 'reactivar';
  target: RawStatus;
  label: string;
  icon: typeof CheckCircle2;
  variant: 'secondary' | 'danger' | 'primary';
  confirmTitle: string;
  confirmBody: string;
}

export const STATUS_ACTIONS: Record<RawStatus, ActionDef[]> = {
  activa: [
    { key: 'finalizar', target: 'finalizada', label: 'Finalizar', icon: CheckCircle2, variant: 'secondary',
      confirmTitle: 'Finalizar actividad', confirmBody: 'Dejará de estar activa. Podés reactivarla más adelante.' },
    { key: 'cancelar', target: 'cancelada', label: 'Cancelar', icon: XCircle, variant: 'danger',
      confirmTitle: 'Cancelar actividad', confirmBody: 'No se envían correos y no se borra: se puede reactivar después.' },
  ],
  finalizada: [
    { key: 'reactivar', target: 'activa', label: 'Reactivar', icon: RotateCcw, variant: 'primary',
      confirmTitle: 'Reactivar actividad', confirmBody: 'Volverá a estar activa, aunque su fecha ya haya pasado.' },
  ],
  cancelada: [
    { key: 'reactivar', target: 'activa', label: 'Reactivar', icon: RotateCcw, variant: 'primary',
      confirmTitle: 'Reactivar actividad', confirmBody: 'Volverá a estar activa, aunque su fecha ya haya pasado.' },
  ],
};

function serverMessage(status: number, body: { error?: string } | null): string {
  switch (status) {
    case 401: return 'Tu sesión expiró. Iniciá sesión de nuevo.';
    case 403: return 'No tenés permiso para cambiar el estado.';
    case 404: return 'La actividad ya no existe o no pertenece a este centro.';
    case 409: return body?.error ?? 'Esa transición de estado no está permitida.';
    case 502: return body?.error ?? 'Problema de red. Reintentá.';
    default: return 'No pudimos cambiar el estado. Intentá de nuevo.';
  }
}

export interface StatusActionsProps {
  id: string;
  statusRaw: RawStatus;
  onChanged: () => void; // 200 → el contenedor cierra + router.refresh()
}

// Diálogo de confirmación + PATCH /status, REUTILIZABLE (lo usan StatusActions
// del drawer de detalle y el menú ⋯ de la tabla/grid). El caller decide cuándo
// montarlo (action != null) y lo desmonta en onClose.
export interface StatusConfirmDialogProps {
  id: string;
  action: ActionDef;
  onClose: () => void;
  onChanged: () => void; // 200 → el contenedor cierra + router.refresh()
}

export function StatusConfirmDialog({ id, action, onClose, onChanged }: StatusConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function confirm() {
    if (busy) return;
    setBusy(true); setError(null);
    let res: Response;
    try {
      res = await fetch(`/app/actividades/api/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: action.target }),
      });
    } catch {
      setBusy(false); setError('Problema de red. Revisá tu conexión e intentá de nuevo.');
      return;
    }
    if (res.status === 200) { setBusy(false); onChanged(); return; }
    let body: { error?: string } | null = null;
    try { body = (await res.json()) as { error?: string }; } catch { /* sin JSON */ }
    setBusy(false);
    setError(serverMessage(res.status, body));
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="statusconfirm-title">
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!busy) onClose(); }}
        className="absolute inset-0 bg-ink/40" />
      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-xl">
        <h3 id="statusconfirm-title" className="text-base font-bold tracking-tight text-ink">{action.confirmTitle}</h3>
        <p className="mt-1.5 text-[13px] text-muted">{action.confirmBody}</p>
        {error ? (
          <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">
            <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" /> {error}
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>No, volver</Button>
          <Button type="button" autoFocus onClick={confirm} disabled={busy}
            className={action.variant === 'danger' ? 'text-danger-fg' : undefined}>
            {busy ? (<><Loader2 size={15} strokeWidth={2.25} aria-hidden="true" className={cn('animate-spin')} /> Aplicando…</>) : `Sí, ${action.label.toLowerCase()}`}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function StatusActions({ id, statusRaw, onChanged }: StatusActionsProps) {
  const [pending, setPending] = useState<ActionDef | null>(null);

  const actions = STATUS_ACTIONS[statusRaw] ?? [];
  if (actions.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a.key} type="button"
            variant={a.variant === 'danger' ? 'secondary' : a.variant}
            onClick={() => setPending(a)}
            className={a.variant === 'danger' ? 'text-danger-fg' : undefined}>
            <a.icon size={16} strokeWidth={2} aria-hidden="true" /> {a.label}
          </Button>
        ))}
      </div>

      {pending ? (
        <StatusConfirmDialog id={id} action={pending} onClose={() => setPending(null)} onChanged={onChanged} />
      ) : null}
    </>
  );
}

// Variante compacta: las transiciones de estado detrás de un botón ⋯ (menú
// accesible: aria-haspopup/expanded, role=menu, flechas ↑↓, Escape/click-afuera
// cierran). El footer del drawer queda con las acciones primarias visibles y
// Finalizar/Cancelar/Reactivar plegadas acá. Portal fixed anclado al botón,
// abre hacia ARRIBA si no hay espacio abajo (el footer vive al pie del drawer).
export function StatusActionsMenu({ id, statusRaw, onChanged }: StatusActionsProps) {
  const btnRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [pending, setPending] = useState<ActionDef | null>(null);

  const actions = STATUS_ACTIONS[statusRaw] ?? [];

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const MENU_W = 192; // w-48
    const estH = actions.length * 38 + 10;
    const top = r.bottom + 4 + estH > window.innerHeight ? Math.max(8, r.top - 4 - estH) : r.bottom + 4;
    setPos({ top, left: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)) });
    setOpen(true);
  };
  const close = () => { setOpen(false); setPos(null); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onAway = () => close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onAway, true);
    window.addEventListener('resize', onAway);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onAway, true);
      window.removeEventListener('resize', onAway);
    };
  }, [open]);

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
  }, [open]);
  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? []);
    if (els.length === 0) return;
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); els[els.length - 1]?.focus(); }
  };

  if (actions.length === 0) return null;

  return (
    <>
      <div ref={btnRef} className="inline-flex">
        <IconButton
          label="Más acciones de la actividad"
          variant="ghost"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? close() : openMenu())}
        >
          <MoreHorizontal size={18} strokeWidth={2} aria-hidden="true" />
        </IconButton>
      </div>

      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Más acciones de la actividad"
              onKeyDown={onMenuKey}
              style={{ top: pos.top, left: pos.left }}
              className="fixed z-[65] w-48 rounded-xl border border-line bg-surface p-1 shadow-xl"
            >
              {actions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  role="menuitem"
                  onClick={() => { close(); setPending(a); }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium',
                    a.variant === 'danger' ? 'text-danger-fg hover:bg-danger-bg' : 'text-ink hover:bg-surface-container',
                    focusRing,
                  )}
                >
                  <a.icon size={15} strokeWidth={2} aria-hidden="true" className={a.variant === 'danger' ? undefined : 'text-muted'} />
                  {a.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      {pending ? (
        <StatusConfirmDialog id={id} action={pending} onClose={() => setPending(null)} onChanged={onChanged} />
      ) : null}
    </>
  );
}
