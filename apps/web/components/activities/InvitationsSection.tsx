'use client';

// apps/web/components/activities/InvitationsSection.tsx · S3 RSVP PR-3: bloque
// de seguimiento de invitaciones en el detalle de actividad. Resumen en una
// línea + lista plegable con estado por invitado y CANCELAR (sólo pendientes,
// sólo owner/admin) con confirmación inline (patrón del zafacón de asistentes).
// Si la actividad no tiene invitaciones, no se muestra nada.

import { useEffect, useState } from 'react';
import { Megaphone, ChevronDown, Loader2, Ban, MailCheck } from 'lucide-react';
import { ActivityInvitationsResponseSchema, type ActivityInvitationsResponse } from '@contan2/contracts';
import { cn, focusRing } from '../ui';

type Inv = ActivityInvitationsResponse['invitations'][number];

const STATUS_LABEL: Record<Inv['status'], { txt: string; cls: string }> = {
  pending: { txt: 'Sin responder', cls: 'bg-surface-container text-muted' },
  confirmed: { txt: 'Confirmada', cls: 'bg-success-bg text-success-fg' },
  declined: { txt: 'No puede', cls: 'bg-surface-container text-muted' },
  expired: { txt: 'Expirada', cls: 'bg-surface-container text-faint' },
  canceled: { txt: 'Cancelada', cls: 'bg-surface-container text-faint' },
};

export function InvitationsSection({ activityId, canManage, refreshKey }: {
  activityId: string;
  canManage: boolean;
  refreshKey: number;
}) {
  const [data, setData] = useState<ActivityInvitationsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    void fetch(`/app/actividades/api/${encodeURIComponent(activityId)}/invitations`, { cache: 'no-store' })
      .then(async (r) => {
        if (ignore || !r.ok) return;
        setData(ActivityInvitationsResponseSchema.parse(await r.json()));
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, [activityId, refreshKey]);

  if (!data || data.summary.total === 0) return null;
  const s = data.summary;

  async function cancel(inv: Inv) {
    if (busy) return;
    setBusy(inv.id); setError(null);
    try {
      const res = await fetch(`/app/actividades/api/${encodeURIComponent(activityId)}/invitations/${encodeURIComponent(inv.id)}/cancel`, { method: 'POST' });
      if (res.status === 204) {
        // Refleja local sin re-fetch: la fila pasa a canceled y el summary se mueve.
        setData((d) => d ? {
          summary: { ...d.summary, pending: Math.max(0, d.summary.pending - 1), canceled: d.summary.canceled + 1 },
          invitations: d.invitations.map((i) => i.id === inv.id ? { ...i, status: 'canceled' as const } : i),
        } : d);
      } else {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(b?.error ?? 'No pudimos cancelar la invitación.');
      }
    } catch {
      setError('Problema de red. Intentá de nuevo.');
    } finally {
      setBusy(null); setConfirming(null);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-line bg-surface-container/50 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
        <Megaphone size={13} strokeWidth={2} aria-hidden="true" /> Invitaciones
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-[13px] tabular-nums text-muted">
          <strong className="text-ink">{s.total}</strong> enviada{s.total === 1 ? '' : 's'} ·{' '}
          <strong className="text-success-fg">{s.confirmed}</strong> confirmada{s.confirmed === 1 ? '' : 's'} ·{' '}
          <strong className="text-ink">{s.pending}</strong> sin responder
          {s.declined > 0 ? <> · {s.declined} no puede{s.declined === 1 ? '' : 'n'}</> : null}
          {s.expired > 0 ? <> · {s.expired} expirada{s.expired === 1 ? '' : 's'}</> : null}
          {s.canceled > 0 ? <> · {s.canceled} cancelada{s.canceled === 1 ? '' : 's'}</> : null}
        </p>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className={cn('ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-muted hover:text-ink', focusRing)}>
          {open ? 'Ocultar' : 'Ver lista'}
          <ChevronDown size={13} strokeWidth={2} aria-hidden="true" className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {error ? <p role="alert" className="mt-2 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-1.5 text-[12.5px] text-danger-fg">{error}</p> : null}

      {open ? (
        <ul className="mt-2 divide-y divide-line/70 border-t border-line/70">
          {data.invitations.map((inv) => (
            <li key={inv.id} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {inv.firstName} {inv.lastName}
                {inv.sentAt ? <MailCheck size={12} strokeWidth={2} aria-label="Email enviado" className="ml-1.5 inline align-[-1px] text-success-fg" /> : null}
              </span>
              <span className={cn('flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_LABEL[inv.status].cls)}>
                {STATUS_LABEL[inv.status].txt}
              </span>
              {canManage && inv.status === 'pending' ? (
                confirming === inv.id ? (
                  <span className="flex flex-none items-center gap-1">
                    <button type="button" disabled={busy === inv.id} onClick={() => void cancel(inv)}
                      className={cn('rounded-lg px-2 py-1 text-[12px] font-semibold text-danger-fg hover:bg-danger-bg', focusRing)}>
                      {busy === inv.id ? <Loader2 size={12} className="inline animate-spin" aria-hidden="true" /> : '¿Cancelar?'}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)}
                      className={cn('rounded-lg px-2 py-1 text-[12px] font-semibold text-muted hover:text-ink', focusRing)}>No</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => { setConfirming(inv.id); setError(null); }}
                    aria-label={`Cancelar invitación de ${inv.firstName} ${inv.lastName}`}
                    className={cn('flex-none rounded-lg p-1.5 text-faint hover:bg-danger-bg hover:text-danger-fg', focusRing)}>
                    <Ban size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
