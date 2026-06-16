// components/activities/AddFromPadronPanel.tsx · "Agregar del padrón": buscá
// usuarios YA EXISTENTES (por nombre/código/email), seleccioná y agregalos a la
// lista de invitados de la actividad. Reusa la búsqueda del check-in y el endpoint
// invite-existing (incluye sin email, sin correo, sin duplicar). Panel controlado.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Loader2, Medal, MailX, UserPlus, CheckCircle2, Check } from 'lucide-react';
import type { CheckinVisitorsResponse, CheckinVisitorItem, ActivityInviteExistingResponse } from '@contan2/contracts';
import { Button, IconButton, cn, focusRing } from '../ui';

export function AddFromPadronPanel({ activityId, activityName, open, onClose, onAdded }: {
  activityId: string;
  activityName: string;
  open: boolean;
  onClose: () => void;
  onAdded: () => void; // refrescar la lista de invitados
}) {
  const [q, setQ] = useState('');
  const [phase, setPhase] = useState<'idle' | 'searching' | 'ready' | 'error'>('idle');
  const [items, setItems] = useState<CheckinVisitorItem[]>([]);
  const [selected, setSelected] = useState<Map<string, { firstName: string; lastName: string }>>(new Map());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Reset al cerrar.
  useEffect(() => {
    if (!open) { setQ(''); setItems([]); setSelected(new Map()); setPhase('idle'); setBusy(false); }
  }, [open]);

  // Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  // Búsqueda debounced contra el padrón (reusa /check-in/api/visitors).
  useEffect(() => {
    if (!open) return;
    const needle = q.trim();
    if (needle.length < 2) { setItems([]); setPhase('idle'); return; }
    setPhase('searching');
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/app/check-in/api/visitors?q=${encodeURIComponent(needle)}&limit=20`, { cache: 'no-store', signal: ctrl.signal });
        if (!res.ok) { setPhase('error'); return; }
        const body = await res.json() as CheckinVisitorsResponse;
        setItems(body.items);
        setPhase('ready');
      } catch (e) { if (!ctrl.signal.aborted) setPhase('error'); }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, open]);

  const toggle = (v: CheckinVisitorItem) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(v.id)) next.delete(v.id);
      else next.set(v.id, { firstName: v.firstName, lastName: v.lastName });
      return next;
    });
  };

  const isInList = useCallback((v: CheckinVisitorItem) => (v.invitedTo ?? []).some((a) => a.activityId === activityId), [activityId]);

  async function add() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    let res: Response | null = null;
    try {
      res = await fetch(`/app/actividades/api/${encodeURIComponent(activityId)}/invite-existing`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userIds: [...selected.keys()] }),
      });
    } catch { /* red */ }
    setBusy(false);
    if (res && res.ok) {
      const body = await res.json() as ActivityInviteExistingResponse;
      const n = body.summary.invited;
      flash(n > 0 ? `${n} ${n === 1 ? 'agregado' : 'agregados'} a la lista${body.summary.alreadyInvited ? ` · ${body.summary.alreadyInvited} ya estaban` : ''}.` : 'Ya estaban todos en la lista.');
      setSelected(new Map());
      onAdded();
    } else {
      flash(res?.status === 403 ? 'No tenés permiso para agregar invitados.' : 'No se pudo agregar. Reintentá.');
    }
  }

  const count = selected.size;
  const rendered = useMemo(() => items, [items]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`Agregar invitados del padrón a ${activityName}`}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!busy) onClose(); }} className="absolute inset-0 bg-ink/40" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
              <UserPlus size={13} strokeWidth={2} aria-hidden="true" /> Agregar del padrón
            </p>
            <h2 className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-ink">{activityName}</h2>
          </div>
          <IconButton label="Cerrar" variant="outline" size="sm" onClick={() => { if (!busy) onClose(); }}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="px-5 pt-4">
          <p className="text-[13px] leading-relaxed text-muted">Buscá personas que <strong className="text-ink">ya están en el padrón</strong> y agregalas a la lista. Las que no tengan correo entran igual (se reciben por nombre); no se envía invitación por email.</p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3">
            <Search size={16} strokeWidth={2} className="text-faint" aria-hidden="true" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, código o email… (mín. 2)"
              className="h-11 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint" />
            {q ? <button type="button" aria-label="Limpiar" onClick={() => setQ('')} className="text-faint hover:text-ink"><X size={15} /></button> : null}
          </div>
        </div>

        <div className="mt-2 flex-1 overflow-y-auto px-3 pb-4">
          {phase === 'idle' && q.trim().length < 2 ? (
            <p className="px-3 py-8 text-center text-[13px] text-faint">Escribí al menos 2 caracteres para buscar.</p>
          ) : phase === 'searching' ? (
            <p className="px-3 py-8 text-center text-[13px] text-faint"><Loader2 size={16} className="mr-1 inline animate-spin" /> Buscando…</p>
          ) : phase === 'error' ? (
            <p className="px-3 py-8 text-center text-[13px] text-danger-fg">No pudimos buscar. Reintentá.</p>
          ) : rendered.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-faint">Nadie coincide con la búsqueda.</p>
          ) : (
            <ul>
              {rendered.map((v) => {
                const inList = isInList(v);
                const checked = selected.has(v.id);
                return (
                  <li key={v.id}>
                    <button type="button" disabled={inList} onClick={() => toggle(v)}
                      className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left [&+*]:border-t', focusRing,
                        inList ? 'cursor-not-allowed opacity-70' : 'hover:bg-surface-container/60')}>
                      <span className={cn('grid h-5 w-5 flex-none place-items-center rounded-md border',
                        inList ? 'border-line bg-surface-container' : checked ? 'border-transparent bg-brand text-white' : 'border-line bg-surface')}>
                        {checked && !inList ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : null}
                      </span>
                      <span className={cn('grid h-9 w-9 flex-none place-items-center rounded-full text-[11px] font-bold',
                        v.protocol ? 'bg-accent-soft text-[#9a6b00]' : 'bg-primary-container text-on-primary-container')}>
                        {(v.firstName[0] ?? '') + (v.lastName[0] ?? '')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-ink">
                          <span className="truncate">{v.firstName} {v.lastName}</span>
                          {v.protocol ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9a6b00]">
                              <Medal size={10} strokeWidth={2.5} aria-hidden="true" /> Protocolo
                            </span>
                          ) : null}
                          {!v.email ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-1.5 py-0.5 text-[10px] font-semibold text-faint">
                              <MailX size={10} strokeWidth={2} aria-hidden="true" /> sin email
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-faint"><span className="tabular-nums">{v.code}</span>{v.email ? ` · ${v.email}` : ''}</span>
                      </span>
                      {inList ? (
                        <span className="inline-flex flex-none items-center gap-1 rounded-lg bg-success-bg px-2 py-1 text-[11.5px] font-semibold text-success-fg">
                          <CheckCircle2 size={13} strokeWidth={2.5} aria-hidden="true" /> En la lista
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-[12.5px] text-muted">{count > 0 ? <><strong className="text-ink tabular-nums">{count}</strong> seleccionad{count === 1 ? 'o' : 'os'}</> : 'Seleccioná personas para agregar'}</p>
          <Button type="button" disabled={count === 0 || busy} onClick={() => void add()} style={{ backgroundColor: 'var(--color-brand)' }}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <UserPlus size={16} strokeWidth={2} aria-hidden="true" />} Agregar {count > 0 ? count : ''} a la lista
          </Button>
        </footer>

        {toast ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center px-5">
            <div className="pointer-events-auto rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-white shadow-lg">{toast}</div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
