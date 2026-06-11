'use client';

// "Invitar audiencia" (S3, diseño aprobado): panel sobre el detalle de la
// actividad. Abre YA apuntado al segmento que la actividad sugiere (ciclo →
// interesados; tipo → fans; fallback activos), con selector para cambiarlo.
// Lista solo INVITABLES (con email, sin ya-registrados/ya-invitados, orden por
// afinidad) con checkboxes + seleccionar todos + búsqueda → "Enviar N
// invitaciones". El envío real de email es dry-run hasta activar RESEND (se
// comunica honesto); las invitaciones quedan creadas y rastreables.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Send, Search, Megaphone, CheckSquare, Square } from 'lucide-react';
import {
  InviteCandidatesResponseSchema, SegmentsResponseSchema,
  type InviteCandidatesResponse, type Segment,
} from '@contan2/contracts';
import { Button, IconButton, cn, focusRing, useDrawerLifecycle } from '../ui';

export function InviteAudiencePanel({ activityId, activityName, open, onClose, onSent }: {
  activityId: string;
  activityName: string;
  open: boolean;
  onClose: () => void;
  onSent: () => void; // refresca el bloque de seguimiento del detalle
}) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentId, setSegmentId] = useState<string | null>(null); // null = sugerido
  const [data, setData] = useState<InviteCandidatesResponse | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { mounted, closing, panelRef } = useDrawerLifecycle({ open, onEscape: () => { if (!busy) onClose(); } });

  const load = useCallback(async (seg: string | null) => {
    setPhase('loading'); setError(null);
    try {
      const qs = seg ? `?segment=${encodeURIComponent(seg)}` : '';
      const res = await fetch(`/app/actividades/api/${encodeURIComponent(activityId)}/invite-candidates${qs}`, { cache: 'no-store' });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(b?.error ?? 'No pudimos cargar los candidatos.');
        setPhase('error');
        return;
      }
      const body = InviteCandidatesResponseSchema.parse(await res.json());
      setData(body);
      setSelected(new Set(body.candidates.map((c) => c.id))); // todos pre-marcados
      setPhase('ready');
    } catch {
      setError('Problema de red. Reintentá.');
      setPhase('error');
    }
  }, [activityId]);

  useEffect(() => {
    if (!open) return;
    setOutcome(null); setSegmentId(null); setQ('');
    void load(null);
    // catálogo de segmentos para el selector (best-effort)
    void fetch('/app/actividades/api/segments-catalog', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setSegments(SegmentsResponseSchema.parse(j).segments); })
      .catch(() => {});
  }, [open, load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.candidates;
    return data.candidates.filter((c) => `${c.firstName} ${c.lastName} ${c.code} ${c.email}`.toLowerCase().includes(needle));
  }, [data, q]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allVisible = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allVisible) filtered.forEach((c) => next.delete(c.id));
    else filtered.forEach((c) => next.add(c.id));
    return next;
  });

  async function send() {
    if (busy || selected.size === 0) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/app/actividades/api/${encodeURIComponent(activityId)}/invitations`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userIds: [...selected].slice(0, 500) }),
      });
      const b = (await res.json().catch(() => null)) as { summary?: { created: number; reused: number; dryRun: boolean }; error?: string } | null;
      if (res.status === 201 && b?.summary) {
        setOutcome(b.summary.dryRun
          ? `${b.summary.created} invitación${b.summary.created === 1 ? '' : 'es'} creada${b.summary.created === 1 ? '' : 's'} (modo simulación: sin clave de envío no salió ningún email; quedan rastreables y los enlaces RSVP ya funcionan).`
          : `${b.summary.created} invitaciones enviadas.`);
        onSent();
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

  const inputCls = cn('w-full bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none');
  return createPortal(
    <div tabIndex={-1} className="fixed inset-0 z-[70] outline-none" role="dialog" aria-modal="true" aria-label={`Invitar audiencia a ${activityName}`}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!busy) onClose(); }}
        className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')} />
      <div ref={panelRef} className={cn(
        'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] md:max-h-none rounded-t-2xl border-t border-line bg-surface shadow-xl',
        'md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-full md:max-w-xl md:rounded-none md:border-l md:border-t-0',
        'flex flex-col', closing && 'drawer-panel--closing')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
              <Megaphone size={13} strokeWidth={2} aria-hidden="true" /> Invitar audiencia
            </p>
            <h2 className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-ink">{activityName}</h2>
          </div>
          <IconButton label="Cerrar" variant="outline" size="sm" onClick={() => { if (!busy) onClose(); }}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {data ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Segmento</span>
                <select
                  value={segmentId ?? data.segment.id}
                  onChange={(e) => { setSegmentId(e.target.value); void load(e.target.value); }}
                  className={cn('mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink', focusRing)}
                >
                  {/* el aplicado siempre presente aunque el catálogo no cargue */}
                  {!segments.some((s) => s.id === data.segment.id) ? (
                    <option value={data.segment.id}>{data.segment.label} ({data.segment.count})</option>
                  ) : null}
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>{s.label} ({s.count})</option>
                  ))}
                </select>
              </label>
              {data.segment.id === data.suggestedSegmentId ? (
                <span className="mt-5 flex-none rounded-md bg-accent-soft px-2 py-1 text-[11px] font-semibold text-[#b35400]">Sugerido por la actividad</span>
              ) : null}
            </div>
          ) : null}

          {phase === 'loading' ? (
            <p className="flex items-center gap-1.5 py-8 text-[13px] text-faint" aria-busy="true">
              <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="animate-spin" /> Buscando candidatos…
            </p>
          ) : phase === 'error' ? (
            <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{error}</p>
          ) : data ? (
            <>
              <p className="text-[12px] text-faint">
                {data.candidates.length} invitable{data.candidates.length === 1 ? '' : 's'}
                {data.excluded.alreadyRegistered > 0 ? ` · ${data.excluded.alreadyRegistered} ya registrados` : ''}
                {data.excluded.alreadyInvited > 0 ? ` · ${data.excluded.alreadyInvited} ya invitados` : ''}
                {data.excluded.noEmail > 0 ? ` · ${data.excluded.noEmail} sin email` : ''}
              </p>

              {data.candidates.length > 0 ? (
                <>
                  <div className="flex items-center gap-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                      <Search size={14} strokeWidth={1.75} aria-hidden="true" className="text-faint" />
                      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar candidato…" aria-label="Buscar candidato" className={inputCls} />
                    </label>
                    <Button type="button" variant="secondary" size="sm" onClick={toggleAll}>
                      {allVisible ? <CheckSquare size={14} strokeWidth={2} aria-hidden="true" /> : <Square size={14} strokeWidth={2} aria-hidden="true" />}
                      {allVisible ? 'Quitar visibles' : 'Marcar visibles'}
                    </Button>
                  </div>

                  <ul className="min-h-0 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                    {filtered.map((c) => (
                      <li key={c.id}>
                        <label className={cn('flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-page', focusRing)}>
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-brand" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-ink">{c.firstName} {c.lastName}</span>
                            <span className="block truncate text-[11px] text-faint">{c.email} · <span className="font-mono">{c.code}</span></span>
                          </span>
                          <span className="flex-none text-[11px] tabular-nums text-faint">{c.totalAttendances} asist.</span>
                        </label>
                      </li>
                    ))}
                    {filtered.length === 0 ? <li className="px-3 py-3 text-[13px] text-faint">Nadie coincide con esa búsqueda.</li> : null}
                  </ul>
                </>
              ) : (
                <p className="rounded-lg bg-surface-container px-3 py-3 text-[13px] text-muted">
                  No quedan candidatos invitables en este segmento. Probá con otro segmento del selector.
                </p>
              )}
            </>
          ) : null}

          {outcome ? <p role="status" className="rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success-fg">{outcome}</p> : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <span className="text-[13px] tabular-nums text-muted">{selected.size} seleccionado{selected.size === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => { if (!busy) onClose(); }}>Cerrar</Button>
            <Button type="button" disabled={busy || selected.size === 0} onClick={() => void send()}
              style={selected.size > 0 && !busy ? { backgroundColor: 'var(--color-brand-accent)' } : undefined}>
              {busy
                ? (<><Loader2 size={15} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Enviando…</>)
                : (<><Send size={15} strokeWidth={2} aria-hidden="true" /> Enviar {selected.size} invitación{selected.size === 1 ? '' : 'es'}</>)}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
