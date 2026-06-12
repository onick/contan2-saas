'use client';

// components/historial/AuditTimeline.tsx · Historial REAL (F5). Lee el log de
// auditoría del tenant vía BFF (/app/historial/api/audit → api-v2 /org/audit) con
// filtros server-side (tipo de evento, actor, rango) y paginación keyset ("cargar
// más"). Cero demo: estados honestos (loading/error/empty/403). Reusa CATEGORY_META
// (íconos/tintes por categoría) del módulo; el resto del demoData queda fuera.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2, History } from 'lucide-react';
import { CATEGORY_META, type EventCategory } from '../../lib/historial/demoData';
import { ACTION_LABEL, actionLabel } from '../../lib/audit/labels';
import { Card, Button, cn, focusRing } from '../ui';

interface Item {
  id: string; category: string; action: string; actorEmailMasked: string | null; actorRole: string | null;
  targetType: string | null; targetId: string | null; targetLabel: string | null; metadata: Record<string, unknown>; createdAt: string;
}
interface Filters { action: string; actor: string; from: string; to: string }

// Acciones conocidas → opciones del <select>. El mapa de etiquetas vive en
// lib/audit/labels (compartido con las notificaciones del Topbar).
const ACTION_OPTIONS = Object.entries(ACTION_LABEL);
const catMeta = (c: string) => CATEGORY_META[(c as EventCategory)] ?? CATEGORY_META.usuario;

function dayOf(iso: string): { key: string; label: string } {
  const d = new Date(iso); const that = new Date(d); that.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  const label = diff === 0 ? 'Hoy' : diff === 1 ? 'Ayer' : that.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
  return { key: that.toISOString().slice(0, 10), label };
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });

export function AuditTimeline() {
  const [filters, setFilters] = useState<Filters>({ action: '', actor: '', from: '', to: '' });
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'more'>('loading');
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const buildQs = useCallback((f: Filters, cur?: string) => {
    const p = new URLSearchParams();
    if (f.action) p.set('action', f.action);
    if (f.actor.trim()) p.set('actor', f.actor.trim());
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
    p.set('limit', '50');
    if (cur) p.set('cursor', cur);
    return p.toString();
  }, []);

  const load = useCallback(async (f: Filters, cur: string | null) => {
    const id = ++reqId.current;
    setPhase(cur ? 'more' : 'loading');
    try {
      const res = await fetch(`/app/historial/api/audit?${buildQs(f, cur ?? undefined)}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (id !== reqId.current) return; // respuesta obsoleta
      if (!res.ok) {
        setError(res.status === 403 ? 'No tenés permiso para ver el historial (solo owner/admin).' : (body.error ?? 'No pudimos cargar el historial.'));
        setPhase('error'); return;
      }
      setItems((prev) => (cur ? [...prev, ...body.items] : body.items));
      setCursor(body.nextCursor ?? null);
      setPhase('ready');
    } catch {
      if (id === reqId.current) { setError('No pudimos conectar. Intentá de nuevo.'); setPhase('error'); }
    }
  }, [buildQs]);

  // Recarga (reset) ante cambio de filtros; debounce para el typing del actor.
  useEffect(() => {
    const t = setTimeout(() => { void load(filters, null); }, 250);
    return () => clearTimeout(t);
  }, [filters, load]);

  const set = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  // Agrupación por día (preserva el orden recientes-primero).
  const groups: { key: string; label: string; events: Item[] }[] = [];
  for (const it of items) {
    const d = dayOf(it.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === d.key) last.events.push(it);
    else groups.push({ key: d.key, label: d.label, events: [it] });
  }

  const inputCls = cn('h-9 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink', focusRing);

  return (
    <div>
      {/* Filtros */}
      <Card padding="none" className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={filters.action} onChange={(e) => set('action', e.target.value)} className={inputCls} aria-label="Tipo de evento">
            <option value="">Todos los eventos</option>
            {ACTION_OPTIONS.map(([a, label]) => <option key={a} value={a}>{label}</option>)}
          </select>
          <label className="relative">
            <span className="sr-only">Buscar por actor</span>
            <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input type="search" value={filters.actor} onChange={(e) => set('actor', e.target.value)} placeholder="Actor (ej. a***@…)" className={cn('h-9 w-44 rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink placeholder:text-faint', focusRing)} />
          </label>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12px] text-faint">Desde
              <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set('from', e.target.value)} className={inputCls} />
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-faint">Hasta
              <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set('to', e.target.value)} className={inputCls} />
            </label>
          </div>
        </div>
      </Card>

      {/* Feed */}
      <div className="mt-4">
        {phase === 'loading' ? (
          <p className="flex items-center gap-2 px-1 py-6 text-[13px] text-faint"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando historial…</p>
        ) : phase === 'error' ? (
          <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{error}</p>
        ) : items.length === 0 ? (
          <Card padding="lg" className="text-center text-[13px] text-faint">
            <History size={20} strokeWidth={1.75} aria-hidden="true" className="mx-auto mb-2 text-faint" />
            No hay eventos para estos filtros.
          </Card>
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.key} className="mb-5">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{g.label}</h3>
                <Card padding="none" className="overflow-hidden">
                  <ul className="divide-y divide-line">
                    {g.events.map((e) => {
                      const m = catMeta(e.category);
                      const Icon = m.icon;
                      return (
                        <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                          <span className={cn('grid h-9 w-9 flex-none place-items-center rounded-lg', m.iconStyle)}>
                            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] text-ink">
                              <span className="font-semibold tabular-nums">{e.actorEmailMasked ?? 'Sistema'}</span>{' '}
                              <span className="text-muted">{actionLabel(e.action)}</span>
                              {e.targetLabel ? <> · <span className="text-ink">{e.targetLabel}</span></> : e.targetId ? <> · <span className="text-faint tabular-nums">{e.targetType}:{e.targetId}</span></> : null}
                            </p>
                            <p className="mt-0.5 text-[11px] text-faint">{m.label}{e.actorRole ? ` · ${e.actorRole}` : ''}</p>
                          </div>
                          <span className="flex-none whitespace-nowrap text-[12px] tabular-nums text-faint">{timeOf(e.createdAt)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </section>
            ))}
            {cursor ? (
              <div className="mt-2 flex justify-center">
                <Button variant="secondary" size="sm" onClick={() => void load(filters, cursor)} disabled={phase === 'more'}>
                  {phase === 'more' ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Cargando…</> : 'Cargar más'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
