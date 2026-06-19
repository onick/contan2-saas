'use client';

// components/equipo/TeamMembers.tsx · sección de miembros del dashboard de equipo.
// Owns la data (búsqueda + filtros rol/estado + paginación) y un toggle de vista
// Tarjetas/Lista. Reusa TeamRowActions para las acciones seguras (rol/estado).
// Estados honestos (loading/error/empty/403). El árbitro RBAC es api-v2.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2, Users, List, LayoutGrid, Calendar, Clock, Mail } from 'lucide-react';
import { Card, Chip, cn, focusRing, type ChipTone } from '../ui';
import { TeamRowActions } from './TeamRowActions';

interface Member { id: string; fullName: string; email: string; role: string; status: string; lastLoginAt: string | null; createdAt: string }
interface Filters { q: string; role: string; status: string }

const ROLE_LABEL: Record<string, string> = { owner: 'Propietario', admin: 'Administrador', operator: 'Operador', protocolo: 'Protocolo', consulta: 'Consulta' };
const ROLE_TONE: Record<string, ChipTone> = { owner: 'warning', admin: 'success', operator: 'neutral', protocolo: 'brand', consulta: 'neutral' };
const STATUS_LABEL: Record<string, string> = { active: 'Activo', suspended: 'Suspendido', deleted: 'Eliminado' };
const STATUS_TONE: Record<string, ChipTone> = { active: 'success', suspended: 'danger', deleted: 'neutral' };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const ago = (iso: string | null) => {
  if (!iso) return 'Nunca';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `hace ${Math.max(1, mins)} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `hace ${d} d` : fmtDate(iso);
};

export function TeamMembers({ currentStaffId, currentRole, onMutated }: {
  currentStaffId?: string; currentRole?: string; onMutated?: () => void;
}) {
  const [filters, setFilters] = useState<Filters>({ q: '', role: '', status: '' });
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [items, setItems] = useState<Member[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'more'>('loading');
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const qs = useCallback((f: Filters, cur?: string) => {
    const p = new URLSearchParams();
    if (f.q.trim()) p.set('q', f.q.trim());
    if (f.role) p.set('role', f.role);
    if (f.status) p.set('status', f.status);
    p.set('limit', '50');
    if (cur) p.set('cursor', cur);
    return p.toString();
  }, []);

  const load = useCallback(async (f: Filters, cur: string | null) => {
    const id = ++reqId.current;
    setPhase(cur ? 'more' : 'loading');
    try {
      const res = await fetch(`/app/equipo/api/team?${qs(f, cur ?? undefined)}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (id !== reqId.current) return;
      if (!res.ok) {
        setError(res.status === 403 ? 'No tenés permiso para ver el equipo (solo owner/admin).' : (body.error ?? 'No pudimos cargar el equipo.'));
        setPhase('error'); return;
      }
      setItems((prev) => (cur ? [...prev, ...body.items] : body.items));
      setCursor(body.nextCursor ?? null);
      setPhase('ready');
    } catch {
      if (id === reqId.current) { setError('Problema de red. Recargá.'); setPhase('error'); }
    }
  }, [qs]);

  useEffect(() => { void load(filters, null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters]);

  const reload = () => { void load(filters, null); onMutated?.(); };
  const set = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const selectCls = cn('h-9 rounded-[10px] border border-line bg-surface px-3 text-[13px] text-ink', focusRing);

  const actions = (m: Member) => currentStaffId && currentRole
    ? <TeamRowActions member={m} currentStaffId={currentStaffId} currentRole={currentRole} onChanged={reload} />
    : null;

  return (
    <Card padding="md">
      {/* toolbar: búsqueda + filtros + toggle */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2">
          <Search size={15} strokeWidth={2} className="text-faint" />
          <input value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Buscar por nombre o email…"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" />
        </div>
        <select value={filters.role} onChange={(e) => set('role', e.target.value)} className={selectCls} aria-label="Filtrar por rol">
          <option value="">Todos los roles</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => set('status', e.target.value)} className={selectCls} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="suspended">Suspendido</option>
        </select>
        <div className="flex flex-none items-center gap-0.5 rounded-[10px] border border-line bg-surface p-1">
          <button type="button" onClick={() => setView('grid')} aria-pressed={view === 'grid'} aria-label="Vista de tarjetas"
            className={cn('grid h-7 w-7 place-items-center rounded-md', focusRing, view === 'grid' ? 'bg-surface-container text-ink' : 'text-faint hover:text-ink')}><LayoutGrid size={15} /></button>
          <button type="button" onClick={() => setView('list')} aria-pressed={view === 'list'} aria-label="Vista de lista"
            className={cn('grid h-7 w-7 place-items-center rounded-md', focusRing, view === 'list' ? 'bg-surface-container text-ink' : 'text-faint hover:text-ink')}><List size={15} /></button>
        </div>
      </div>

      <div className="mt-4">
        {phase === 'loading' ? (
          <p className="flex items-center gap-2 px-1 py-6 text-[13px] text-faint"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando equipo…</p>
        ) : phase === 'error' ? (
          <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{error}</p>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-faint"><Users size={20} strokeWidth={1.75} className="mx-auto mb-2" /> No hay miembros para estos filtros.</div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((m) => (
              <div key={m.id} data-member className="relative rounded-xl border border-line bg-surface-container/40 p-4">
                <div className="absolute right-2.5 top-2.5">{actions(m)}</div>
                <div className="flex items-center gap-3 pr-6">
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-brand/10 text-[15px] font-extrabold text-brand">{initials(m.fullName)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold leading-tight text-ink">{m.fullName}</p>
                    <p className="truncate text-[12px] text-muted">{m.email}</p>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Chip tone={ROLE_TONE[m.role] ?? 'neutral'} dot>{ROLE_LABEL[m.role] ?? m.role}</Chip>
                  <Chip tone={STATUS_TONE[m.status] ?? 'neutral'} dot>{STATUS_LABEL[m.status] ?? m.status}</Chip>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-2.5 text-[11.5px]">
                  <p className="flex items-center gap-1 text-faint"><Clock size={12} strokeWidth={1.9} /> Acceso <span className="font-semibold text-ink">{ago(m.lastLoginAt)}</span></p>
                  <p className="flex items-center gap-1 text-faint"><Calendar size={12} strokeWidth={1.9} /> Alta <span className="font-semibold text-ink">{fmtDate(m.createdAt)}</span></p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-line">
            {items.map((m) => (
              <li key={m.id} data-member className="flex items-center gap-3 border-t border-line bg-surface px-4 py-3 first:border-t-0">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-brand/10 text-[12px] font-extrabold text-brand">{initials(m.fullName)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{m.fullName}</p>
                  <p className="truncate text-[12px] text-faint"><Mail size={11} className="mr-0.5 inline align-[-1px]" />{m.email}</p>
                </div>
                <span className="hidden sm:block"><Chip tone={ROLE_TONE[m.role] ?? 'neutral'} dot>{ROLE_LABEL[m.role] ?? m.role}</Chip></span>
                <span className="hidden md:block"><Chip tone={STATUS_TONE[m.status] ?? 'neutral'} dot>{STATUS_LABEL[m.status] ?? m.status}</Chip></span>
                <span className="hidden w-24 flex-none text-[12px] text-muted lg:block">{ago(m.lastLoginAt)}</span>
                {actions(m)}
              </li>
            ))}
          </ul>
        )}

        {cursor ? (
          <div className="mt-3 flex justify-center">
            <button type="button" onClick={() => void load(filters, cursor)} disabled={phase === 'more'}
              className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-semibold text-muted hover:bg-page hover:text-ink disabled:opacity-50', focusRing)}>
              {phase === 'more' ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Cargando…</> : 'Cargar más'}
            </button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
