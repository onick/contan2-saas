'use client';

// "Invitar protocolo" (módulo Protocolo PR-4): panel sobre el detalle de la
// actividad, hermano del de audiencia. Lista los DESIGNADOS invitables (con
// email; exclusiones honestas) con su tratamiento y categoría, y un stepper
// de ACOMPAÑANTES (+N, 0..10) por invitado — al confirmar, el RSVP reserva
// 1+N cupos. Dry-run honesto sin clave de envío.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Send, Search, Medal, Minus, Plus } from 'lucide-react';
import { Button, IconButton, cn, focusRing, useDrawerLifecycle } from '../ui';

interface Candidate {
  userId: string;
  code: string;
  firstName: string;
  lastName: string;
  email: string;
  category: string;
  honorific: string | null;
  orgTitle: string | null;
}
interface CandidatesBody {
  candidates: Candidate[];
  excluded: { alreadyRegistered: number; alreadyInvited: number; noEmail: number };
}

const CATEGORY_LABEL: Record<string, string> = {
  autoridad: 'Autoridad', diplomatico: 'Diplomático', prensa: 'Prensa',
  patrocinador: 'Patrocinador', directivo: 'Directivo', artista: 'Artista', otro: 'Otro',
};
const MAX_PLUS = 10;

export function InviteProtocolPanel({ activityId, activityName, open, onClose, onSent }: {
  activityId: string;
  activityName: string;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [data, setData] = useState<CandidatesBody | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  // userId → plusOnes; presencia en el mapa = seleccionado.
  const [picked, setPicked] = useState<Map<string, number>>(new Map());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { mounted, closing, panelRef } = useDrawerLifecycle({ open, onEscape: () => { if (!busy) onClose(); } });

  const load = useCallback(async () => {
    setPhase('loading'); setError(null);
    try {
      const res = await fetch(`/app/actividades/api/${encodeURIComponent(activityId)}/protocol-candidates`, { cache: 'no-store' });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(b?.error ?? 'No pudimos cargar el directorio de protocolo.');
        setPhase('error');
        return;
      }
      const body = (await res.json()) as CandidatesBody;
      setData(body);
      setPicked(new Map()); // protocolo se elige a mano (lotes chicos, con +N)
      setPhase('ready');
    } catch {
      setError('Problema de red. Reintentá.');
      setPhase('error');
    }
  }, [activityId]);

  useEffect(() => {
    if (!open) return;
    setOutcome(null); setQ('');
    void load();
  }, [open, load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.candidates;
    return data.candidates.filter((c) =>
      `${c.honorific ?? ''} ${c.firstName} ${c.lastName} ${c.code} ${c.orgTitle ?? ''} ${CATEGORY_LABEL[c.category] ?? ''}`.toLowerCase().includes(needle));
  }, [data, q]);

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Map(prev);
    if (next.has(id)) next.delete(id); else next.set(id, 0);
    return next;
  });
  const bump = (id: string, delta: number) => setPicked((prev) => {
    const next = new Map(prev);
    const cur = next.get(id);
    if (cur === undefined) return prev;
    next.set(id, Math.min(MAX_PLUS, Math.max(0, cur + delta)));
    return next;
  });

  const totalParty = [...picked.values()].reduce((a, n) => a + 1 + n, 0);

  async function send() {
    if (busy || picked.size === 0) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/app/actividades/api/${encodeURIComponent(activityId)}/protocol-invitations`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invites: [...picked.entries()].slice(0, 100).map(([userId, plusOnes]) => ({ userId, plusOnes })) }),
      });
      const b = (await res.json().catch(() => null)) as { summary?: { created: number; reused: number; dryRun: boolean }; error?: string } | null;
      if (res.status === 201 && b?.summary) {
        setOutcome(b.summary.dryRun
          ? `${b.summary.created} invitación${b.summary.created === 1 ? '' : 'es'} de protocolo creada${b.summary.created === 1 ? '' : 's'} (modo simulación: sin clave de envío no salió ningún email; los enlaces RSVP ya funcionan y reservan al invitado con sus acompañantes).`
          : `${b.summary.created} invitaciones de protocolo enviadas.`);
        onSent();
        void load();
      } else {
        setError(b?.error ?? 'No pudimos crear las invitaciones.');
      }
    } catch {
      setError('Problema de red. Reintentá.');
    } finally {
      setBusy(false);
    }
  }

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div tabIndex={-1} className="fixed inset-0 z-[70] outline-none" role="dialog" aria-modal="true" aria-label={`Invitar protocolo a ${activityName}`}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!busy) onClose(); }}
        className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')} />
      <div ref={panelRef} className={cn(
        'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] md:max-h-none rounded-t-2xl border-t border-line bg-surface shadow-xl',
        'md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-full md:max-w-xl md:rounded-none md:border-l md:border-t-0',
        'flex flex-col', closing && 'drawer-panel--closing')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
              <Medal size={13} strokeWidth={2} aria-hidden="true" /> Invitar protocolo
            </p>
            <h2 className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-ink">{activityName}</h2>
          </div>
          <IconButton label="Cerrar" variant="outline" size="sm" onClick={() => { if (!busy) onClose(); }}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {phase === 'loading' ? (
            <p className="flex items-center gap-1.5 py-8 text-[13px] text-faint" aria-busy="true">
              <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="animate-spin" /> Buscando designados…
            </p>
          ) : phase === 'error' ? (
            <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{error}</p>
          ) : data ? (
            <>
              <p className="text-[12px] text-faint">
                {data.candidates.length} invitable{data.candidates.length === 1 ? '' : 's'} del directorio
                {data.excluded.alreadyRegistered > 0 ? ` · ${data.excluded.alreadyRegistered} ya registrados` : ''}
                {data.excluded.alreadyInvited > 0 ? ` · ${data.excluded.alreadyInvited} ya invitados` : ''}
                {data.excluded.noEmail > 0 ? ` · ${data.excluded.noEmail} sin email` : ''}
              </p>

              {data.candidates.length > 0 ? (
                <>
                  <label className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                    <Search size={14} strokeWidth={1.75} aria-hidden="true" className="text-faint" />
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar designado…" aria-label="Buscar designado"
                      className="w-full bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none" />
                  </label>

                  <ul className="min-h-0 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                    {filtered.map((c) => {
                      const sel = picked.get(c.userId);
                      return (
                        <li key={c.userId} className="flex items-center gap-3 px-3 py-2.5">
                          <input type="checkbox" checked={sel !== undefined} onChange={() => toggle(c.userId)}
                            aria-label={`Invitar a ${c.firstName} ${c.lastName}`} className="h-4 w-4 accent-brand" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-ink">
                              {c.honorific ? `${c.honorific} ` : ''}{c.firstName} {c.lastName}
                            </span>
                            <span className="block truncate text-[11px] text-faint">
                              {CATEGORY_LABEL[c.category] ?? c.category}{c.orgTitle ? ` · ${c.orgTitle}` : ''}
                            </span>
                          </span>
                          {sel !== undefined ? (
                            <span className="flex flex-none items-center gap-1.5 rounded-full border border-line px-1.5 py-1">
                              <button type="button" onClick={() => bump(c.userId, -1)} disabled={sel === 0}
                                aria-label={`Quitar acompañante a ${c.firstName}`}
                                className={cn('grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-surface-container disabled:opacity-40', focusRing)}>
                                <Minus size={12} strokeWidth={2.5} aria-hidden="true" />
                              </button>
                              <span className="min-w-7 text-center text-[12px] font-semibold tabular-nums text-ink">+{sel}</span>
                              <button type="button" onClick={() => bump(c.userId, 1)} disabled={sel >= MAX_PLUS}
                                aria-label={`Sumar acompañante a ${c.firstName}`}
                                className={cn('grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-surface-container disabled:opacity-40', focusRing)}>
                                <Plus size={12} strokeWidth={2.5} aria-hidden="true" />
                              </button>
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                    {filtered.length === 0 ? <li className="px-3 py-3 text-[13px] text-faint">Nadie coincide con esa búsqueda.</li> : null}
                  </ul>
                </>
              ) : (
                <p className="rounded-lg bg-surface-container px-3 py-3 text-[13px] text-muted">
                  No quedan designados invitables. Designá invitados en el módulo Protocolo o revisá los ya invitados en el seguimiento.
                </p>
              )}
            </>
          ) : null}

          {outcome ? <p role="status" className="rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success-fg">{outcome}</p> : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <span className="text-[13px] tabular-nums text-muted">
            {picked.size} invitado{picked.size === 1 ? '' : 's'}{picked.size > 0 ? ` · ${totalParty} persona${totalParty === 1 ? '' : 's'} con acompañantes` : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => { if (!busy) onClose(); }}>Cerrar</Button>
            <Button type="button" disabled={busy || picked.size === 0} onClick={() => void send()}
              style={picked.size > 0 && !busy ? { backgroundColor: 'var(--color-brand-accent)' } : undefined}>
              {busy
                ? (<><Loader2 size={15} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Enviando…</>)
                : (<><Send size={15} strokeWidth={2} aria-hidden="true" /> Enviar {picked.size} invitación{picked.size === 1 ? '' : 'es'}</>)}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
