'use client';

// components/shell/TopbarNotifications.tsx · la campana del Topbar AHORA es
// real: muestra los últimos eventos del log de auditoría del tenant (la misma
// fuente del Historial, vía BFF). El punto de "no leídas" es HONESTO: solo
// aparece si hay eventos más nuevos que la última vez que se abrió el panel
// (marca en localStorage); abrir el panel los marca como vistos. Para
// operator (sin permiso de historial → 403) la campana NO se renderiza: cero
// affordances falsas. Si el feed falla, panel con estado honesto.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Loader2, History } from 'lucide-react';
import { actionLabel, relativeTimeEs } from '../../lib/audit/labels';
import { cn, focusRing } from '../ui/cn';

interface AuditItem {
  id: string;
  action: string;
  actorEmailMasked: string | null;
  targetLabel: string | null;
  createdAt: string;
}

const SEEN_KEY = 'contan2.notif.lastSeen';
const LIMIT = 8;

// localStorage puede no existir (SSR) o fallar (privado/lleno): nunca rompe.
const getSeen = (): string | null => {
  try { return window.localStorage.getItem(SEEN_KEY); } catch { return null; }
};
const setSeen = (v: string): void => {
  try { window.localStorage.setItem(SEEN_KEY, v); } catch { /* no-op */ }
};

export function TopbarNotifications() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [items, setItems] = useState<AuditItem[]>([]);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let ignore = false;
    void fetch(`/app/historial/api/audit?limit=${LIMIT}`, { cache: 'no-store' })
      .then(async (r) => {
        if (ignore) return;
        if (r.status === 403) { setPhase('forbidden'); return; }
        if (!r.ok) { setPhase('error'); return; }
        const b = (await r.json()) as { items?: AuditItem[] };
        const list = b.items ?? [];
        setItems(list);
        setPhase('ready');
        const newest = list[0]?.createdAt;
        const seen = getSeen();
        setHasUnread(!!newest && (!seen || newest > seen));
      })
      .catch(() => { if (!ignore) setPhase('error'); });
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Operator sin permiso de historial: nada que mostrar → nada que fingir.
  if (phase === 'forbidden') return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    const newest = items[0]?.createdAt;
    if (next && newest) {
      setSeen(newest);
      setHasUnread(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label={hasUnread ? 'Notificaciones (hay novedades)' : 'Notificaciones'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={cn('relative grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-surface-container', focusRing)}
      >
        <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
        {hasUnread ? (
          <span aria-hidden="true" className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-brand-accent ring-2 ring-surface" />
        ) : null}
      </button>

      {open ? (
        <div role="menu" aria-label="Notificaciones"
          className="absolute right-0 top-11 z-30 w-[340px] rounded-xl border border-line bg-surface shadow-xl">
          <p className="border-b border-line px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.06em] text-faint">
            Actividad reciente
          </p>
          {phase === 'loading' ? (
            <p className="flex items-center gap-2 px-4 py-5 text-[13px] text-faint" aria-busy="true">
              <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="animate-spin" /> Cargando…
            </p>
          ) : phase === 'error' ? (
            <p className="px-4 py-5 text-[13px] text-faint">No pudimos cargar la actividad reciente.</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-5 text-[13px] text-faint">Sin actividad reciente. Lo que pase en el centro aparecerá acá.</p>
          ) : (
            <ul className="max-h-[330px] overflow-y-auto py-1">
              {items.map((it) => (
                <li key={it.id} className="px-4 py-2">
                  <p className="text-[13px] leading-snug text-ink">
                    <strong className="font-semibold">{it.actorEmailMasked ?? 'Sistema'}</strong>{' '}
                    {actionLabel(it.action)}
                    {it.targetLabel ? <span className="text-muted"> · {it.targetLabel}</span> : null}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-faint">{relativeTimeEs(it.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/app/historial"
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center justify-center gap-1.5 border-t border-line px-4 py-2.5 text-[13px] font-semibold text-brand hover:bg-surface-container',
              focusRing,
            )}
          >
            <History size={14} strokeWidth={2} aria-hidden="true" /> Ver historial completo
          </Link>
        </div>
      ) : null}
    </div>
  );
}
