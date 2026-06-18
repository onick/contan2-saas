// components/checkin/GuestListDrawer.tsx · panel de "lista de invitados" en la
// puerta. Trabajar la lista: progreso vivo, filtros (pendientes/llegaron/todos),
// buscador, y "Dar entrada" de un toque por invitado. Reusa endpoints existentes:
// GET /actividades/api/:id/invitations (lista + estado), POST /check-in/api/checkin
// (dar entrada), DELETE /check-in/api/attendance/:id (deshacer · owner/admin).
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X, Search, Loader2, Medal, MailX, RotateCw, ListChecks, UserPlus, Plus, Minus, Users } from 'lucide-react';
import type { ActivityInvitationsResponse, CheckinActivityItem, CheckinVisitorItem, CheckinVisitorsResponse, AdminCheckinRequest } from '@contan2/contracts';
import { Button, IconButton, cn, focusRing } from '../ui';
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
  // Escalonado de búsqueda: del padrón + crear nuevo, sin salir del modal.
  const [padron, setPadron] = useState<CheckinVisitorItem[]>([]);
  const [padronPhase, setPadronPhase] = useState<'idle' | 'loading' | 'done'>('idle');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [addBusy, setAddBusy] = useState<string | null>(null); // userId del padrón o 'new' en curso
  // Acompañantes por invitado al dar entrada (cuentan aforo, sin credencial).
  // Default = +N autorizados del invitado de protocolo; ajustable 0..10.
  const [comp, setComp] = useState<Record<string, number>>({});
  const companionsOf = (inv: Inv): number => comp[inv.id] ?? (isProto(inv) ? inv.plusOnes : 0);
  const setCompFor = (id: string, n: number) => setComp((c) => ({ ...c, [id]: Math.min(10, Math.max(0, n)) }));

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
    if (!open) { setData(null); setPhase('loading'); setFilter('pending'); setQ(''); setPadron([]); setPadronPhase('idle'); setCreateOpen(false); return; }
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activityId]);

  // Búsqueda en el PADRÓN (debounced) cuando se teclea ≥2 chars → habilita
  // "Agregar y dar entrada" a gente que no está en la lista. Se cancela al limpiar.
  useEffect(() => {
    const needle = q.trim();
    setCreateOpen(false);
    if (!open || needle.length < 2) { setPadron([]); setPadronPhase('idle'); return; }
    setPadronPhase('loading');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/app/check-in/api/visitors?q=${encodeURIComponent(needle)}&limit=8`, { cache: 'no-store' });
        if (!res.ok) { setPadron([]); setPadronPhase('done'); return; }
        const body = await res.json() as CheckinVisitorsResponse;
        setPadron(body.items); setPadronPhase('done');
      } catch { setPadron([]); setPadronPhase('done'); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, open]);

  // Escape para cerrar.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  async function darEntrada(inv: Inv) {
    if (!activityId || busy) return;
    const companions = companionsOf(inv); // acompañantes a contar en el aforo
    setBusy(inv.id);
    // El TIPO DE PÚBLICO de la actividad decide si los acompañantes son niños
    // (infantil) o adultos (default). Una sola decisión al crear la actividad
    // gobierna el rótulo; el aforo los suma por separado.
    const infantil = activity?.audience === 'infantil';
    const r = await postCheckin({
      activityId,
      visitor: { code: inv.code },
      companionsChildren: infantil ? companions : 0,
      companionsAdults: infantil ? 0 : companions,
    });
    setBusy(null);
    if (r.ok) {
      flash(companions > 0
        ? `${inv.firstName} entró con +${companions} acompañante${companions > 1 ? 's' : ''} (${companions + 1} en total).`
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

  // Admitir (check-in + asegurar en la lista) a un visitante existente o nuevo.
  async function admit(visitor: AdminCheckinRequest['visitor'], label: string, key: string) {
    if (!activityId || addBusy) return;
    setAddBusy(key);
    const r = await postCheckin({ activityId, visitor, companionsChildren: 0, companionsAdults: 0, addToList: true });
    setAddBusy(null);
    if (r.ok) {
      flash(`${label} entró.`);
      setQ(''); setCreateOpen(false); setForm({ firstName: '', lastName: '', email: '', phone: '' });
      void load(); onArrival();
    } else {
      flash(r.status === 409 ? (r.error || 'Cupo agotado.') : (r.error || 'No se pudo registrar.'));
    }
  }

  // Solo agregar a la lista (sin dar entrada) · owner/admin (invite-existing).
  async function addOnly(item: CheckinVisitorItem) {
    if (!activityId || addBusy) return;
    setAddBusy(item.id);
    let res: Response | null = null;
    try {
      res = await fetch(`/app/actividades/api/${encodeURIComponent(activityId)}/invite-existing`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userIds: [item.id] }) });
    } catch { /* red */ }
    setAddBusy(null);
    if (res && res.ok) { flash(`${item.firstName} agregado a la lista.`); setQ(''); void load(); }
    else if (res && res.status === 403) flash('Solo un administrador puede agregar sin dar entrada.');
    else flash('No se pudo agregar.');
  }

  function createAndAdmit() {
    const firstName = form.firstName.trim(), lastName = form.lastName.trim();
    if (!firstName || !lastName) { flash('Nombre y apellido son obligatorios.'); return; }
    const email = form.email.trim(), phone = form.phone.trim();
    void admit({ new: { firstName, lastName, ...(email ? { email } : {}), ...(phone ? { phone } : {}) } }, firstName, 'new');
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

  // Escalonado: usuarios del padrón que NO están ya en la lista (por userId).
  const searching = q.trim().length >= 2;
  const inListIds = useMemo(() => new Set((data?.invitations ?? []).filter((i) => i.status !== 'canceled').map((i) => i.userId)), [data]);
  const padronNew = useMemo(() => padron.filter((p) => !inListIds.has(p.id)), [padron, inListIds]);

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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la lista o el padrón…"
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
          ) : (
            <>
              {rows.length > 0 ? (
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
                      <div className="flex flex-none items-center gap-1.5">
                        {/* Acompañantes (cuentan aforo, sin credencial). 0 → botón
                            "+"; >0 → stepper. Protocolo arranca con sus +N. */}
                        {companionsOf(inv) > 0 ? (
                          <span className="flex items-center rounded-lg border border-line" title="Acompañantes">
                            <button type="button" aria-label="Menos acompañantes" disabled={busy === inv.id} onClick={() => setCompFor(inv.id, companionsOf(inv) - 1)}
                              className={cn('grid h-9 w-8 place-items-center text-muted hover:text-ink disabled:opacity-50', focusRing)}><Minus size={14} strokeWidth={2.5} aria-hidden="true" /></button>
                            <span className="min-w-[34px] text-center text-[13px] font-semibold tabular-nums text-ink">+{companionsOf(inv)}</span>
                            <button type="button" aria-label="Más acompañantes" disabled={busy === inv.id || companionsOf(inv) >= 10} onClick={() => setCompFor(inv.id, companionsOf(inv) + 1)}
                              className={cn('grid h-9 w-8 place-items-center text-muted hover:text-ink disabled:opacity-50', focusRing)}><Plus size={14} strokeWidth={2.5} aria-hidden="true" /></button>
                          </span>
                        ) : (
                          <button type="button" aria-label={`Agregar acompañante a ${inv.firstName}`} title="Vino con acompañante" disabled={busy === inv.id} onClick={() => setCompFor(inv.id, 1)}
                            className={cn('grid h-9 w-9 place-items-center rounded-lg border border-line text-faint hover:bg-surface-container hover:text-ink disabled:opacity-50', focusRing)}><Users size={16} strokeWidth={2} aria-hidden="true" /></button>
                        )}
                        <Button size="sm" disabled={busy === inv.id}
                          style={{ backgroundColor: 'var(--color-brand)' }} onClick={() => void darEntrada(inv)}>
                          {busy === inv.id ? <Loader2 size={15} aria-hidden="true" className="animate-spin" /> : <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />} Dar entrada{companionsOf(inv) > 0 ? ` · +${companionsOf(inv)}` : ''}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
              </ul>
              ) : !searching ? (
                <p className="px-3 py-8 text-center text-[13px] text-faint">
                  {total === 0 ? 'Nadie en la lista todavía. Buscá arriba para agregar del padrón o crear un visitante y darle entrada.'
                    : filter === 'pending' ? 'Todos los invitados ya llegaron 🎉' : 'Sin invitados.'}
                </p>
              ) : null}

              {searching ? (
                <div className="mt-1">
                  {/* Del padrón */}
                  <div className="flex items-center gap-2 px-3 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wide text-faint">
                    Del padrón <span className="h-px flex-1 bg-line" />
                  </div>
                  {padronPhase === 'loading' ? (
                    <p className="px-3 py-2 text-[12.5px] text-faint">Buscando en el padrón…</p>
                  ) : padronNew.length === 0 ? (
                    <p className="px-3 py-2 text-[12.5px] text-faint">{padronPhase === 'done' ? 'Nadie del padrón coincide.' : '…'}</p>
                  ) : (
                    <ul>
                      {padronNew.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 [&+li]:border-t [&+li]:border-line">
                          <span className={cn('grid h-10 w-10 flex-none place-items-center rounded-full text-[12px] font-bold', p.protocol ? 'bg-accent-soft text-[#9a6b00]' : 'bg-primary-container text-on-primary-container')}>
                            {(p.firstName[0] ?? '') + (p.lastName[0] ?? '')}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] font-semibold text-ink">
                              <span className="truncate">{p.firstName} {p.lastName}</span>
                              {p.protocol ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9a6b00]">
                                  <Medal size={10} strokeWidth={2.5} aria-hidden="true" /> Protocolo
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-faint"><span className="tabular-nums">{p.code}</span>{p.email ? ` · ${p.email}` : ' · sin email'} · {p.visitCount} {p.visitCount === 1 ? 'visita' : 'visitas'}</p>
                          </div>
                          <div className="flex flex-none items-center gap-2">
                            <button type="button" disabled={addBusy === p.id} onClick={() => void addOnly(p)}
                              className={cn('rounded-lg border border-line bg-surface px-2.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-surface-container disabled:opacity-50', focusRing)}>
                              Solo agregar
                            </button>
                            <Button size="sm" disabled={addBusy === p.id} style={{ backgroundColor: 'var(--color-brand)' }} onClick={() => void admit({ code: p.code }, p.firstName, p.id)}>
                              {addBusy === p.id ? <Loader2 size={15} aria-hidden="true" className="animate-spin" /> : <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />} Agregar y dar entrada
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Crear nuevo */}
                  <div className="px-3 pb-2 pt-3">
                    {!createOpen ? (
                      <button type="button" onClick={() => { const parts = q.trim().split(/\s+/); setForm({ firstName: parts[0] ?? '', lastName: parts.slice(1).join(' '), email: '', phone: '' }); setCreateOpen(true); }}
                        className={cn('flex w-full items-center gap-3 rounded-xl border border-dashed border-line bg-surface p-3 text-left hover:border-brand-accent hover:bg-accent-soft/40', focusRing)}>
                        <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-accent-soft text-brand"><UserPlus size={18} strokeWidth={2} aria-hidden="true" /></span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-bold text-ink">Crear visitante «{q.trim()}»</span>
                          <span className="block text-[12px] text-muted">Se agrega al padrón, a esta lista y se le da entrada.</span>
                        </span>
                      </button>
                    ) : (
                      <div className="rounded-xl border border-line bg-surface-container/40 p-3.5">
                        <h4 className="text-[13.5px] font-bold text-ink">Crear visitante nuevo</h4>
                        <p className="mb-3 mt-0.5 text-[12px] text-muted">No está en el padrón. Se crea, se agrega a la lista y se le da entrada.</p>
                        <div className="grid grid-cols-2 gap-2.5">
                          {([['firstName', 'Nombre', false], ['lastName', 'Apellido', false], ['email', 'Email · opcional', true], ['phone', 'Teléfono · opcional', true]] as const).map(([key, label, opt]) => (
                            <label key={key} className="block">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">{label}</span>
                              <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                                inputMode={key === 'phone' ? 'tel' : key === 'email' ? 'email' : 'text'}
                                placeholder={opt ? (key === 'email' ? 'para enviar credencial' : '809…') : ''}
                                className={cn('mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[14px] text-ink', focusRing)} />
                            </label>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setCreateOpen(false)} className={cn('rounded-lg px-3 py-2 text-[13px] font-semibold text-muted hover:bg-surface-container', focusRing)}>Cancelar</button>
                          <Button size="sm" disabled={addBusy === 'new'} style={{ backgroundColor: 'var(--color-brand)' }} onClick={createAndAdmit}>
                            {addBusy === 'new' ? <Loader2 size={15} aria-hidden="true" className="animate-spin" /> : <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />} Crear, agregar y dar entrada
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </>
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
