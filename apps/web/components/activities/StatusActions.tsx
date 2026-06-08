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

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import { Button, cn } from '../ui';

type RawStatus = 'activa' | 'finalizada' | 'cancelada';

interface ActionDef {
  key: 'finalizar' | 'cancelar' | 'reactivar';
  target: RawStatus;
  label: string;
  icon: typeof CheckCircle2;
  variant: 'secondary' | 'danger' | 'primary';
  confirmTitle: string;
  confirmBody: string;
}

const ACTIONS: Record<RawStatus, ActionDef[]> = {
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

export function StatusActions({ id, statusRaw, onChanged }: StatusActionsProps) {
  const [pending, setPending] = useState<ActionDef | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = ACTIONS[statusRaw] ?? [];

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setPending(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, busy]);

  async function confirm() {
    if (!pending || busy) return;
    setBusy(true); setError(null);
    let res: Response;
    try {
      res = await fetch(`/app/actividades/api/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: pending.target }),
      });
    } catch {
      setBusy(false); setError('Problema de red. Revisá tu conexión e intentá de nuevo.');
      return;
    }
    if (res.status === 200) { setBusy(false); setPending(null); onChanged(); return; }
    let body: { error?: string } | null = null;
    try { body = (await res.json()) as { error?: string }; } catch { /* sin JSON */ }
    setBusy(false);
    setError(serverMessage(res.status, body));
  }

  if (actions.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a.key} type="button"
            variant={a.variant === 'danger' ? 'secondary' : a.variant}
            onClick={() => { setError(null); setPending(a); }}
            className={a.variant === 'danger' ? 'text-danger-fg' : undefined}>
            <a.icon size={16} strokeWidth={2} aria-hidden="true" /> {a.label}
          </Button>
        ))}
      </div>

      {pending
        ? createPortal(
            <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="statusconfirm-title">
              <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!busy) setPending(null); }}
                className="absolute inset-0 bg-ink/40" />
              <div className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-xl">
                <h3 id="statusconfirm-title" className="text-base font-bold tracking-tight text-ink">{pending.confirmTitle}</h3>
                <p className="mt-1.5 text-[13px] text-muted">{pending.confirmBody}</p>
                {error ? (
                  <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">
                    <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" /> {error}
                  </p>
                ) : null}
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setPending(null)} disabled={busy}>No, volver</Button>
                  <Button type="button" autoFocus onClick={confirm} disabled={busy}
                    className={pending.variant === 'danger' ? 'text-danger-fg' : undefined}>
                    {busy ? (<><Loader2 size={15} strokeWidth={2.25} aria-hidden="true" className={cn('animate-spin')} /> Aplicando…</>) : `Sí, ${pending.label.toLowerCase()}`}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
