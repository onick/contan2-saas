// components/checkin/GuestListDrawer.tsx · panel de "lista de invitados" en la
// puerta. Trabajar la lista: progreso vivo, filtros (pendientes/llegaron/todos),
// buscador, y "Dar entrada" de un toque por invitado. Reusa endpoints existentes:
// GET /actividades/api/:id/invitations (lista + estado), POST /check-in/api/checkin
// (dar entrada), DELETE /check-in/api/attendance/:id (deshacer · owner/admin).
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X, Search, Loader2, Medal, MailX, RotateCw, ListChecks } from 'lucide-react';
import type { ActivityInvitationsResponse, CheckinActivityItem } from '@contan2/contracts';
import { Button, Chip, IconButton, cn, focusRing } from '../ui';
import { postCheckin } from '../../lib/api/checkin-client';

type Inv = ActivityInvitationsResponse['invitations'][number];
type Filter = 'pending' | 'arrived' | 'all';

// Protocolo: designado (protocol_profiles, vía isProtocol) o invitación kind=protocol.
const isProto = (i: Inv): boolean => i.isProtocol ?? i.kind === 'protocol';
const fmtHour = (iso: string) => new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });

export function GuestListDrawer({ activity, onClose, onArrival }: {
  activity: CheckinActivityItem | null;
  onClose: () => void;
  onArrival: () => void; // refrescar métricas/cupos del console tras un cambio
}) {
  const open = activity !== null;
  const activityId = activity?.id ?? null;
  const [data, setData] = useState<ActivityInvitationsResponse | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filter, setFilter] = useState<Filter>('pending');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // invitation id en curso
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    if (!activityId) return;
    try {
      const res = await fetch(`/app/actividades/api/${encodeURIComponent(activityId)}/invitations`, { cache: 'no-store' });
      if (!res.ok) { setPhase((p) => (data ? p : 'error')); return; }
      setData(await res.json() as ActivityInvitationsResponse);
      setPhase('ready');
    } catch { setPhase((p) => (data ? p : 'error')); }
  }, [activityId, data]);

  // Carga al abrir + polling 15s (refleja llegadas del scanner / otros dispositivos).
  useEffect(() => {
    if (!open) { setData(null); setPhase('loading'); setFilter('pending'); setQ(''); return; }
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activityId]);

  // Escape para cerrar.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  async function darEntrada(inv: Inv) {
    if (!activityId || busy) return;
    setBusy(inv.id);
    const r = await postCheckin({ activityId, visitor: { code: inv.code }, companionsChildren: 0 });
    setBusy(null);
    if (r.ok) {
      const proto = r.data.protocol;
      flash(proto && proto.plusOnes > 0
        ? `${inv.firstName} entró · trae +${proto.plusOnes} acompañantes autorizados.`
        : `${inv.firstName} entró.`);
      void load(); onArrival();
    } else {
      flash(r.status === 409 ? (r.error || 'Cupo agotado.') : (r.error || 'No se pudo registrar.'));
      if (r.status === 409) void load();
    }
  }

  async function deshacer(inv: Inv) {
    if (!inv.attendanceId || busy) return;
    if (!window.confirm(`¿Deshacer la entrada de ${inv.firstName} ${inv.lastName}?`)) return;
    setBusy(inv.id);
    let res: Response | null = null;
    try { res = await fetch(`/app/check-in/api/attendance/${encodeURIComponent(inv.attendanceId)}`, { method: 'DELETE' }); }
    catch { /* red */ }
    setBusy(null);
    if (res && (res.ok || res.status === 204)) { flash('Entrada deshecha.'); void load(); onArrival(); }
    else if (res && res.status === 403) flash('Solo un administrador puede deshacer la entrada.');
    else flash('No se pudo deshacer.');
  }

  const s = data?.summary;
  const arrived = s?.attended ?? 0;
  const total = s ? Math.max(0, s.total - s.canceled) : (activity?.guestList?.total ?? 0);
  const pendingCount = Math.max(0, total - arrived);
  const pct = total > 0 ? Math.round((arrived / total) * 100) : 0;

  const rows = useMemo(() => {
    if (!data) return [];
    let list = data.invitations.filter((i) => i.status !== 'canceled');
    if (filter === 'pending') list = list.filter((i) => i.status !== 'attended');
    else if (filter === 'arrived') list = list.filter((i) => i.status === 'attended');
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((i) => `${i.firstName} ${i.lastName} ${i.code}`.toLowerCase().includes(needle));
    return [...list].sort((a, b) => {
      const aa = a.status === 'attended' ? 1 : 0, ba = b.status === 'attended' ? 1 : 0;
      if (aa !== ba) return aa - ba;                                   // pendientes primero
      const ap = isProto(a) ? 0 : 1, bp = isProto(b) ? 0 : 1;
      if (ap !== bp) return ap - bp;                                   // protocolo arriba
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'es');
    });
  }, [data, filter, q]);

  if (!open || !activity) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`Lista de invitados · ${activity.name}`}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!busy) onClose(); }} className="absolute inset-0 bg-ink/40" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[42rem] flex-col bg-surface shadow-2xl">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
              <ListChecks size={13} strokeWidth={2} aria-hidden="true" /> Lista de invitados
            </p>
            <h2 className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-ink">{activity.name}</h2>
            <p className="mt-0.5 text-xs text-faint">{activity.location} · <span className="tabular-nums">{fmtHour(activity.date)}</span></p>
          </div>
          <IconButton label="Cerrar" variant="outline" size="sm" onClick={() => { if (!busy) onClose(); }}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        {/* Progreso */}
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[15px] font-semibold tracking-tight text-ink">
              <span className="tabular-nums text-xl font-bold">{arrived}</span>
              <span className="text-muted"> de {total} llegaron</span>
            </p>
            <p className="text-xs text-faint">Aforo <span className="font-semibold text-ink tabular-nums">{activity.enrolledCount}</span> / {activity.capacity}</p>
          </div>
          <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-surface-container" aria-hidden="true">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-brand), var(--color-brand-accent))' }} />
          </div>
        </div>

        {/* Filtros + buscador */}
        <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
          {([['pending', 'Pendientes', pendingCount], ['arrived', 'Llegaron', arrived], ['all', 'Todos', total]] as const).map(([key, label, n]) => (
            <button key={key} type="button" onClick={() => setFilter(key)}
              className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold', focusRing,
                filter === key ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-muted hover:bg-surface-container')}>
              {label} <span className={cn('tabular-nums', filter === key ? 'text-white/70' : 'text-faint')}>{n}</span>
            </button>
          ))}
        </div>
        <div className="px-5 pb-2 pt-3">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-container px-3">
            <Search size={16} strokeWidth={2} className="text-faint" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la lista…"
              className="h-10 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint" />
            {q ? <button type="button" aria-label="Limpiar" onClick={() => setQ('')} className="text-faint hover:text-ink"><X size={15} /></button> : null}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {phase === 'loading' ? (
            <p className="px-3 py-8 text-center text-[13px] text-faint">Cargando lista…</p>
          ) : phase === 'error' ? (
            <p className="px-3 py-8 text-center text-[13px] text-danger-fg">No pudimos cargar la lista. <button type="button" onClick={() => void load()} className="underline">Reintentar</button></p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-faint">{filter === 'pending' ? 'Todos los invitados ya llegaron 🎉' : q ? 'Nadie coincide con la búsqueda.' : 'Sin invitados.'}</p>
          ) : (
            <ul>
              {rows.map((inv) => {
                const attended = inv.status === 'attended';
                const noEmail = !inv.email;
                return (
                  <li key={inv.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 [&+li]:border-t [&+li]:border-line hover:bg-surface-container/50">
                    <span className={cn('grid h-10 w-10 flex-none place-items-center rounded-full text-[12px] font-bold',
                      isProto(inv) ? 'bg-accent-soft text-[#9a6b00]' : 'bg-primary-container text-on-primary-container')}>
                      {(inv.firstName[0] ?? '') + (inv.lastName[0] ?? '')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] font-semibold text-ink">
                        <span className="truncate">{inv.firstName} {inv.lastName}</span>
                        {isProto(inv) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9a6b00]">
                            <Medal size={10} strokeWidth={2.5} aria-hidden="true" /> Protocolo{inv.plusOnes > 0 ? ` · +${inv.plusOnes}` : ''}
                          </span>
                        ) : null}
                        {noEmail ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-1.5 py-0.5 text-[10px] font-semibold text-faint">
                            <MailX size={10} strokeWidth={2} aria-hidden="true" /> sin email
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-faint"><span className="tabular-nums">{inv.code}</span>{inv.email ? ` · ${inv.email}` : ' · recibir por nombre'}</p>
                    </div>
                    {attended ? (
                      <div className="flex flex-none items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg px-2.5 py-1.5 text-[12.5px] font-semibold text-success-fg">
                          <CheckCircle2 size={14} strokeWidth={2.5} aria-hidden="true" /> Llegó
                        </span>
                        {inv.attendanceId ? (
                          <button type="button" disabled={busy === inv.id} onClick={() => void deshacer(inv)}
                            className={cn('text-[11.5px] text-faint underline hover:text-ink disabled:opacity-50', focusRing)}>
                            {busy === inv.id ? '…' : 'Deshacer'}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <Button size="sm" className="flex-none" disabled={busy === inv.id}
                        style={{ backgroundColor: 'var(--color-brand)' }} onClick={() => void darEntrada(inv)}>
                        {busy === inv.id ? <Loader2 size={15} aria-hidden="true" className="animate-spin" /> : <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />} Dar entrada
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer: refrescar */}
        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-[11.5px] text-faint">Se actualiza solo cada 15 s · refleja el scanner y otros dispositivos.</p>
          <IconButton label="Refrescar lista" variant="outline" size="sm" onClick={() => void load()}><RotateCw size={15} strokeWidth={2} aria-hidden="true" /></IconButton>
        </footer>

        {toast ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-5">
            <div className="pointer-events-auto rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-white shadow-lg">{toast}</div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
