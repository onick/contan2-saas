'use client';

// components/equipo/TeamTable.tsx · Mi equipo REAL (F5). Lista server-side de
// staff_members vía BFF (/app/equipo/api/team → api-v2 /org/team) con búsqueda +
// filtros (rol/status) + paginación ("cargar más"). Cero demo: estados honestos
// (loading/error/empty/403). Solo lectura; las acciones seguras van en otro PR.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2, Users } from 'lucide-react';
import { Card, Chip, cn, focusRing, type ChipTone } from '../ui';
import { TeamRowActions } from './TeamRowActions';

interface Member {
  id: string; fullName: string; email: string; role: string; status: string; lastLoginAt: string | null; createdAt: string;
}
interface Filters { q: string; role: string; status: string }

export interface TeamTableProps {
  // Staff actual (de la sesión, server-side): habilita el gating de las acciones.
  currentStaffId?: string;
  currentRole?: string;
}

const ROLE_LABEL: Record<string, string> = { owner: 'Propietario', admin: 'Administrador', operator: 'Operador', protocolo: 'Protocolo' };
const ROLE_TONE: Record<string, ChipTone> = { owner: 'warning', admin: 'success', operator: 'neutral' };
const STATUS_LABEL: Record<string, string> = { active: 'Activo', suspended: 'Suspendido', deleted: 'Eliminado' };
const STATUS_TONE: Record<string, ChipTone> = { active: 'success', suspended: 'danger', deleted: 'neutral' };

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export function TeamTable({ currentStaffId, currentRole }: TeamTableProps = {}) {
  const [filters, setFilters] = useState<Filters>({ q: '', role: '', status: '' });
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
      if (id === reqId.current) { setError('No pudimos conectar. Intentá de nuevo.'); setPhase('error'); }
    }
  }, [qs]);

  useEffect(() => {
    const t = setTimeout(() => { void load(filters, null); }, 250);
    return () => clearTimeout(t);
  }, [filters, load]);

  const set = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const selectCls = cn('h-9 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink', focusRing);

  return (
    <div>
      <Card padding="none" className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Buscar por nombre o email</span>
            <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input type="search" value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Buscar nombre o email…" className={cn('h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink placeholder:text-faint', focusRing)} />
          </label>
          <select value={filters.role} onChange={(e) => set('role', e.target.value)} className={selectCls} aria-label="Filtrar por rol">
            <option value="">Todos los roles</option>
            <option value="owner">Propietario</option>
            <option value="admin">Administrador</option>
            <option value="operator">Operador</option>
          </select>
          <select value={filters.status} onChange={(e) => set('status', e.target.value)} className={selectCls} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            <option value="active">Activo</option>
            <option value="suspended">Suspendido</option>
          </select>
        </div>
      </Card>

      <div className="mt-4">
        {phase === 'loading' ? (
          <p className="flex items-center gap-2 px-1 py-6 text-[13px] text-faint"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando equipo…</p>
        ) : phase === 'error' ? (
          <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{error}</p>
        ) : items.length === 0 ? (
          <Card padding="lg" className="text-center text-[13px] text-faint">
            <Users size={20} strokeWidth={1.75} aria-hidden="true" className="mx-auto mb-2 text-faint" />
            No hay miembros para estos filtros.
          </Card>
        ) : (
          <>
            <Card padding="none" className="overflow-hidden">
              {/* Mobile (<md): tarjetas (la tabla min-w-720 forzaba scroll horizontal). */}
              <ul className="md:hidden">
                {items.map((m) => (
                  <li key={m.id} className="border-t border-line px-4 py-3.5 first:border-t-0">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface-container text-[12px] font-semibold text-muted">{initials(m.fullName)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{m.fullName}</p>
                        <p className="truncate text-xs text-faint">{m.email}</p>
                      </div>
                      {currentStaffId && currentRole ? (
                        <TeamRowActions member={m} currentStaffId={currentStaffId} currentRole={currentRole} onChanged={() => void load(filters, null)} />
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-12 text-xs text-faint">
                      <Chip tone={ROLE_TONE[m.role] ?? 'neutral'} dot>{ROLE_LABEL[m.role] ?? m.role}</Chip>
                      <Chip tone={STATUS_TONE[m.status] ?? 'neutral'} dot>{STATUS_LABEL[m.status] ?? m.status}</Chip>
                      <span>· acceso {fmtDate(m.lastLoginAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Tablet/desktop (md+): tabla. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                      <th className="px-5 py-3">Miembro</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="hidden px-4 py-3 md:table-cell">Último acceso</th>
                      <th className="hidden px-4 py-3 lg:table-cell">Alta</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((m) => (
                      <tr key={m.id} className="border-t border-line align-middle">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface-container text-[12px] font-semibold text-muted">{initials(m.fullName)}</span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink">{m.fullName}</p>
                              <p className="truncate text-xs text-faint">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5"><Chip tone={ROLE_TONE[m.role] ?? 'neutral'} dot>{ROLE_LABEL[m.role] ?? m.role}</Chip></td>
                        <td className="px-4 py-3.5"><Chip tone={STATUS_TONE[m.status] ?? 'neutral'} dot>{STATUS_LABEL[m.status] ?? m.status}</Chip></td>
                        <td className="hidden whitespace-nowrap px-4 py-3.5 text-[13px] text-muted md:table-cell">{fmtDate(m.lastLoginAt)}</td>
                        <td className="hidden whitespace-nowrap px-4 py-3.5 text-[13px] text-muted lg:table-cell">{fmtDate(m.createdAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right">
                          {currentStaffId && currentRole ? (
                            <TeamRowActions member={m} currentStaffId={currentStaffId} currentRole={currentRole} onChanged={() => void load(filters, null)} />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            {cursor ? (
              <div className="mt-3 flex justify-center">
                <button type="button" onClick={() => void load(filters, cursor)} disabled={phase === 'more'}
                  className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-semibold text-muted hover:bg-page hover:text-ink disabled:opacity-50', focusRing)}>
                  {phase === 'more' ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Cargando…</> : 'Cargar más'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
