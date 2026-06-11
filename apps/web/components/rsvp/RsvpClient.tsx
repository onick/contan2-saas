'use client';

// Cliente del RSVP público: preview de la invitación (actividad con portada y
// encuadre) + botones Sí voy / No puedo. Estados honestos: expirada/cancelada/
// ya respondida. El "sí" puede fallar por cupo lleno (409) → se muestra claro.

import { useEffect, useState } from 'react';
import { Loader2, CalendarDays, MapPin, CheckCircle2, XCircle, AlertTriangle, PartyPopper } from 'lucide-react';
import { RsvpPreviewResponseSchema, type RsvpPreviewResponse } from '@contan2/contracts';
import { cn, focusRing } from '../ui';

const FMT = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

type Inv = RsvpPreviewResponse['invitation'];

export function RsvpClient({ token, orgFallback }: { token: string; orgFallback: string }) {
  const [inv, setInv] = useState<Inv | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [result, setResult] = useState<'confirmed' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/rsvp/api?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) { setPhase('missing'); return; }
        setInv(RsvpPreviewResponseSchema.parse(await r.json()).invitation);
        setPhase('ready');
      })
      .catch(() => setPhase('missing'));
  }, [token]);

  async function respond(action: 'yes' | 'no') {
    if (busy) return;
    setBusy(action); setError(null);
    try {
      const res = await fetch('/rsvp/api', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, action }),
      });
      const b = (await res.json().catch(() => null)) as { status?: string; error?: string; alreadyResponded?: boolean } | null;
      if (res.ok && (b?.status === 'confirmed' || b?.status === 'declined')) {
        setResult(b.status as 'confirmed' | 'declined');
      } else if (res.ok && b?.alreadyResponded) {
        setResult((b.status === 'confirmed' ? 'confirmed' : 'declined'));
      } else {
        setError(b?.error ?? 'No pudimos registrar tu respuesta. Intentá de nuevo.');
      }
    } catch {
      setError('Problema de red. Intentá de nuevo.');
    } finally {
      setBusy(null);
    }
  }

  if (phase === 'loading') {
    return <p className="flex items-center justify-center gap-2 py-16 text-[14px] text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando invitación…</p>;
  }
  if (phase === 'missing' || !inv) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center">
        <AlertTriangle size={26} strokeWidth={1.75} aria-hidden="true" className="mx-auto text-danger-fg" />
        <p className="mt-2 text-sm font-semibold text-ink">Invitación no encontrada</p>
        <p className="mt-1 text-[13px] text-muted">Revisá el enlace de tu correo o pedí una invitación nueva al centro.</p>
      </div>
    );
  }

  const a = inv.activity;
  const inactive = inv.status !== 'pending';
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      {a.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.imageUrl} alt="" className="h-44 w-full object-cover" style={{ objectPosition: `50% ${a.imagePosY ?? 50}%` }} />
      ) : null}
      <div className="p-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">{inv.organization.name || orgFallback}</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-ink">{a.name}</h1>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} aria-hidden="true" /> {FMT.format(new Date(a.date))}</span>
          <span className="inline-flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" /> {a.location}</span>
        </p>

        {result === 'confirmed' || (inactive && inv.status === 'confirmed') ? (
          <div className="mt-5 rounded-xl bg-success-bg p-4 text-center" role="status">
            <PartyPopper size={24} strokeWidth={1.75} aria-hidden="true" className="mx-auto text-success-fg" />
            <p className="mt-1.5 text-sm font-semibold text-success-fg">¡Te esperamos, {inv.firstName}!</p>
            <p className="mt-0.5 text-[13px] text-success-fg/90">Tu cupo quedó apartado. Presentá tu código QR en la entrada.</p>
          </div>
        ) : result === 'declined' || (inactive && inv.status === 'declined') ? (
          <p className="mt-5 rounded-xl bg-surface-container p-4 text-center text-[13px] text-muted" role="status">
            Quedó registrado que no podés asistir. ¡Gracias por avisar, {inv.firstName}!
          </p>
        ) : inactive ? (
          <p className="mt-5 rounded-xl bg-surface-container p-4 text-center text-[13px] text-muted" role="status">
            {inv.status === 'expired' ? 'Esta invitación expiró.' : 'Esta invitación fue cancelada.'}
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-ink">Hola {inv.firstName}, ¿nos acompañás?</p>
            {error ? <p role="alert" className="mt-3 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{error}</p> : null}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" disabled={!!busy} onClick={() => void respond('yes')}
                className={cn('inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold text-white', focusRing)}
                style={{ backgroundColor: 'var(--color-brand-accent)' }}>
                {busy === 'yes' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={17} strokeWidth={2} aria-hidden="true" />} Sí, voy
              </button>
              <button type="button" disabled={!!busy} onClick={() => void respond('no')}
                className={cn('inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-[15px] font-semibold text-muted hover:text-ink', focusRing)}>
                {busy === 'no' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <XCircle size={17} strokeWidth={2} aria-hidden="true" />} No puedo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
