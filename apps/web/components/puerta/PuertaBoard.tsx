'use client';

// components/puerta/PuertaBoard.tsx · superficie de PUERTA de las salas
// permanentes (Ada Balcácer, Sala VR). Cada entrada CUENTA (sin cupo/dedup). El
// registro captura al visitante como usuario real (reusa la infra del check-in):
// drawer con pestañas Nuevo visitante / Buscar-QR / Grupo, + "sin datos"
// secundario. La VR además tiene su agenda de colegios (VrAgenda). El aforo
// físico lo maneja el staff → NO mostramos contador de ocupación. Integrado al
// sistema de diseño (Card/Button/Chip/EmptyState + drawer estándar).

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Check, AlertTriangle, Plus, QrCode, Users, X, UserPlus, Search, DoorOpen, UserCheck, Undo2, RotateCw } from 'lucide-react';
import type { PuertaSala, CheckinVisitorItem } from '@contan2/contracts';
import { searchCheckinVisitors } from '../../lib/api/checkin-client';
import { Card, Button, IconButton, Field, Chip, EmptyState, ErrorState, cn, focusRing, useDrawerLifecycle } from '../ui';
import { DoorButton } from './DoorButton';
import { NumberField } from '../ui/arc/number-field/NumberField';
import { PuertaIdentify } from './PuertaIdentify';
import { VrAgenda } from './VrAgenda';
import { salaColor } from './salaColors';

const money = (n: number) => n.toLocaleString('en-US');

// La puerta se opera en una tablet (820 px): todo control mide >=44 px TAMBIEN desde md
// (el Button del kit baja a 40 px en md+, por eso el `md:min-h-11` explicito).
const T44 = 'min-h-11 md:min-h-11';
// Field del kit usa md:min-h-10 en su caja; en la puerta sube a 44 px (variante de hijo, mayor especificidad).
const FIELD44 = '[&>div]:md:min-h-11';
const TAB_KEY = 'puerta:reg-tab';

type OkData = {
  visitor: string | null; code?: string | null;
  registered: { salaName: string; partySize?: number }[];
  entryIds?: string[]; replay?: boolean; lastEntryToday?: string | null;
};
type Reg = { salaIds: string[] } | null;
type OkMsg = (r: OkData) => string;
const defaultOkMsg: OkMsg = (r) =>
  `Registrado${r.visitor ? ` · ${r.visitor}` : ''}${r.code ? ` (${r.code})` : ''} en ${r.registered.map((x) => x.salaName).join(' y ')}.`;

/** Duración del aviso "Deshacer" en pantalla (el API acepta deshacer hasta 10 min). */
const UNDO_TOAST_MS = 10_000;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
const newKey = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Toast =
  | { k: 'ok'; head: string; detail: string; entryIds: string[] }
  | { k: 'err'; t: string; retry: boolean }
  | { k: 'info'; t: string };
type Pending = { body: Record<string, unknown>; okMsg: OkMsg; at: string };

export function PuertaBoard({ initial }: { initial: PuertaSala[] }) {
  const [salas, setSalas] = useState<PuertaSala[]>(initial);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmRecent, setConfirmRecent] = useState<Pending | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [reg, setReg] = useState<Reg>(null);
  const [busy, setBusy] = useState(false);
  // Estado de la carga de salas: distingue "aún no sé" / "falló" / "sin permiso"
  // de "no hay salas" (lista vacía con 200).
  const [load, setLoad] = useState<'loading' | 'ok' | 'error' | 'forbidden'>(initial.length > 0 ? 'ok' : 'loading');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/app/puerta/api/salas', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json().catch(() => null);
        if (j && Array.isArray(j.salas)) { setSalas(j.salas); setLoad('ok'); }
        else setLoad('error');
      } else if (res.status === 403) setLoad('forbidden');
      else setLoad('error');
    } catch { setLoad('error'); /* conserva las salas previas, si hay */ }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 20000); return () => clearInterval(t); }, [refresh]);

  const byId = useMemo(() => Object.fromEntries(salas.map((s) => [s.id, s])), [salas]);

  // Idempotencia (PUE-A01): UNA clave por intento. Si el intento falla por red/timeout
  // y el staff reintenta con los MISMOS datos, se reutiliza la clave (el servidor
  // devuelve el registro original en vez de duplicarlo). Un intento exitoso o un
  // rechazo definitivo (4xx) la descarta.
  const inflight = useRef(false); // guard SINCRONO: `busy` (estado) puede ir un frame atrasado
  const attempt = useRef<{ fp: string; key: string } | null>(null);
  const lastReq = useRef<Pending | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  async function submit(body: unknown, okMsg: OkMsg, opts: { confirmed?: boolean } = {}) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true); setToast(null); setConfirmRecent(null);
    const base = body as Record<string, unknown>;
    const fp = JSON.stringify(base);
    if (!attempt.current || attempt.current.fp !== fp) attempt.current = { fp, key: newKey() };
    const payload = opts.confirmed ? base : { ...base, checkRecent: true };
    lastReq.current = { body: base, okMsg, at: '' };
    try {
      const res = await fetch('/app/puerta/api/registrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': attempt.current.key },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data?.code === 'recent_entry' && data.lastEntryToday) {
        setConfirmRecent({ body: base, okMsg, at: data.lastEntryToday });
        return;
      }
      if (!res.ok) {
        // 5xx/429: conserva la clave (pudo procesarse); 4xx: rechazo definitivo.
        const transient = res.status >= 500 || res.status === 429;
        if (!transient) attempt.current = null;
        setToast({ k: 'err', t: data.error ?? 'No se pudo registrar.', retry: transient });
        return;
      }
      attempt.current = null; lastReq.current = null;
      const r = data as OkData;
      const people = r.registered.reduce((n, x) => n + (x.partySize ?? 1), 0);
      setToast({ k: 'ok', head: `Entrada registrada · ${people} ${people === 1 ? 'persona' : 'personas'}`, detail: okMsg(r), entryIds: r.entryIds ?? [] });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setToast((t) => (t?.k === 'ok' ? null : t)), UNDO_TOAST_MS);
      setReg(null);
      refresh();
    } catch {
      // Red caida / timeout: la clave se conserva para "Reintentar".
      setToast({ k: 'err', t: 'Problema de red. El registro pudo no haberse guardado.', retry: true });
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  function retryLast() {
    const r = lastReq.current;
    if (r) void submit(r.body, r.okMsg);
  }

  async function undo(ids: string[]) {
    if (undoing || ids.length === 0) return;
    setUndoing(true);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    try {
      const results = await Promise.all(ids.map((id) => fetch(`/app/puerta/api/entries/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)));
      const bad = results.find((r) => !r || !r.ok);
      if (bad !== undefined) {
        const j = bad ? await bad.json().catch(() => ({})) : {};
        setToast({ k: 'err', t: j.error ?? 'No se pudo deshacer. Revisa tu conexión.', retry: false });
      } else {
        setToast({ k: 'info', t: 'Entrada deshecha.' });
        undoTimer.current = setTimeout(() => setToast((t) => (t?.k === 'info' ? null : t)), 4000);
      }
      refresh();
    } finally { setUndoing(false); }
  }

  // Ctrl/Cmd+Z mientras el aviso esta visible = Deshacer (teclado, sin tener que tabular).
  useEffect(() => {
    if (toast?.k !== 'ok') return;
    const ids = toast.entryIds;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); void undo(ids); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  // Avisos (toast + confirmacion de reentrada). Con el drawer abierto se renderizan DENTRO
  // del dialogo (el drawer deja `inert` todo lo de afuera y atrapa el foco); si no, fijos abajo.
  const notices = (inline: boolean) => (
    <div className={inline ? 'flex flex-col gap-2 border-t border-line px-4 py-3' : 'pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-4'}>
      <div role="status" aria-live="polite" aria-atomic="true" className={cn('w-full max-w-lg', !inline && 'pointer-events-auto')}>
        {toast ? (
          <div role={toast.k === 'err' ? 'alert' : undefined}
            className={cn('flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium shadow-lg',
              toast.k === 'err' ? 'bg-danger-bg text-danger-fg' : 'bg-success-bg text-success-fg')}>
            {toast.k === 'err' ? <AlertTriangle size={18} className="flex-none" /> : <Check size={18} className="flex-none" />}
            <div className="min-w-0 flex-1">
              {toast.k === 'ok'
                ? (<><div className="font-semibold">{toast.head}</div><div className="truncate text-[12.5px] font-normal opacity-80">{toast.detail}</div></>)
                : <span>{toast.t}</span>}
            </div>
            {toast.k === 'ok' ? (
              <Button variant="secondary" size="md" className={cn(T44, 'flex-none')} disabled={undoing}
                onClick={() => void undo(toast.entryIds)} aria-keyshortcuts="Control+Z Meta+Z">
                <Undo2 size={16} /> Deshacer
              </Button>
            ) : null}
            {toast.k === 'err' && toast.retry ? (
              <Button variant="secondary" size="md" className={cn(T44, 'flex-none')} disabled={busy} onClick={retryLast}>
                <RotateCw size={15} /> Reintentar
              </Button>
            ) : null}
            <IconButton label="Cerrar aviso" variant="ghost" size="md" className="flex-none" onClick={() => setToast(null)}>
              <X size={16} />
            </IconButton>
          </div>
        ) : null}
      </div>
      {confirmRecent ? (
        <div role="alertdialog" aria-labelledby="recent-title" className={cn('flex w-full max-w-lg items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-xl', !inline && 'pointer-events-auto')}>
          <AlertTriangle size={18} className="flex-none text-warning-fg" />
          <p id="recent-title" className="min-w-0 flex-1 text-[14px] font-medium text-ink">
            Entró a las {hhmm(confirmRecent.at)}. ¿Registrar otra entrada?
          </p>
          <Button variant="secondary" size="md" className={cn(T44, 'flex-none')} onClick={() => setConfirmRecent(null)}>Cancelar</Button>
          <DoorButton size="md" className="flex-none" autoFocus
            onClick={() => { const c = confirmRecent; void submit(c.body, c.okMsg, { confirmed: true }); }}>
            Registrar otra
          </DoorButton>
        </div>
      ) : null}
    </div>
  );

  return (
    <div>
      {!reg ? notices(false) : null}

      {salas.length >= 2 ? (
        <div className="mb-4 flex justify-end">
          <Button variant="secondary" className={T44} onClick={() => setReg({ salaIds: salas.map((s) => s.id) })}>
            <Users size={15} /> Registrar en ambas salas
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {salas.length === 0 && load === 'loading' ? (
          <p className="py-6 text-center text-[13px] text-muted md:col-span-2">Cargando salas…</p>
        ) : salas.length === 0 && load !== 'ok' ? (
          <div className="md:col-span-2">
            {load === 'forbidden'
              ? <ErrorState kind="forbidden" title="No tienes permiso para ver las salas" />
              : <ErrorState title="No pudimos cargar las salas" description="La conexión con el servidor falló. Esto no significa que no haya salas configuradas." onRetry={() => { setLoad('loading'); void refresh(); }} />}
          </div>
        ) : salas.length === 0 ? (
          <div className="md:col-span-2">
            <EmptyState icon={DoorOpen} title="No hay salas permanentes" description="Todavía no se configuraron salas permanentes (Ada Balcácer, Sala VR) para este tenant." />
          </div>
        ) : salas.map((s) => {
          const col = salaColor(s.aforo);
          const isVR = s.aforo !== null;
          return (
            <Card key={s.id} padding="none" className="flex flex-col overflow-hidden">
              <div className="h-1.5" style={{ backgroundColor: col.c }} />
              <div className="flex items-start justify-between gap-3 p-5 pb-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: col.deep }}>{isVR ? 'Realidad virtual' : 'Sala de exposición'}</div>
                  <div className="mt-1 text-[24px] font-semibold tracking-tight text-ink">{s.name}</div>
                </div>
                <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: col.soft, color: col.deep }}>
                  {isVR ? <QrCode size={22} /> : <Users size={22} />}
                </span>
              </div>

              <div className="px-5 pb-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Visitantes hoy</div>
                <div className="text-[34px] font-bold leading-none tabular-nums" style={{ color: col.deep }}>{money(s.visitorsToday)}</div>
                {typeof s.visitorsWeek === 'number' ? (
                  <div className="mt-1.5 text-[12px] text-muted">Últimos 7 días: <b className="font-bold tabular-nums text-ink">{money(s.visitorsWeek)}</b></div>
                ) : null}
              </div>

              {s.todayBookings.length > 0 ? (
                <div className="mx-5 mt-3 rounded-xl border border-line bg-surface-container/50 p-3">
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-faint">Reservas de hoy</div>
                  {s.todayBookings.map((b) => (
                    <div key={b.id} className="flex items-center gap-2.5 py-1 text-[13px] text-ink">
                      <span className="font-mono font-bold tabular-nums text-muted">{b.time}</span>
                      <span className="min-w-0 flex-1 truncate">{b.colegio}{b.level ? ` · ${b.level}` : ''}</span>
                      <span className="text-muted tabular-nums">{b.studentCount}</span>
                      <Chip tone={b.status === 'confirmed' ? 'success' : b.status === 'attended' ? 'brand' : b.status === 'no_show' ? 'warning' : 'neutral'} dot>
                        {b.status === 'confirmed' ? 'Confirmada' : b.status === 'attended' ? 'Asistió' : b.status === 'no_show' ? 'No vino' : 'Agendada'}
                      </Chip>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-auto p-5 pt-4">
                <div className="flex gap-2">
                  <DoorButton size="lg" tone={isVR ? 'vr' : 'brand'} className="min-w-0 flex-1" onClick={() => setReg({ salaIds: [s.id] })}>
                    <Plus size={20} strokeWidth={2.4} /> Registrar entrada
                  </DoorButton>
                  {/* Acceso directo: 1 persona anónima en esta sala, sin abrir el drawer.
                      Misma ruta que el registro: clave por intento, aviso fijo con Deshacer. */}
                  <Button variant="secondary" className={cn(T44, 'flex-none')} disabled={busy}
                    aria-label={`+1 anónimo en ${s.name}`}
                    onClick={() => void submit({ salaIds: [s.id], mode: 'anonymous', companions: 0 }, defaultOkMsg)}>
                    <UserPlus size={16} aria-hidden="true" /> +1 anónimo
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* La descarga de datos vive en /app/puerta/reportes (con sala + rango). */}

      {/* Agenda de la Sala VR (aforo != null): agendar visitas de colegios. */}
      {salas.filter((s) => s.aforo !== null).map((s) => (
        <VrAgenda key={`agenda-${s.id}`} salaId={s.id} salaName={s.name} aforo={s.aforo} />
      ))}

      <RegisterSheet reg={reg} byId={byId} busy={busy} onClose={() => setReg(null)} onSubmit={submit} notice={reg ? notices(true) : null} />
    </div>
  );
}

// ── Drawer de registro: pestañas Nuevo / Buscar / Grupo + "sin datos" ───────────
type Tab = 'new' | 'search' | 'group';
// Última pestaña usada (localStorage, tolerante a fallos: modo privado, datos bloqueados, SSR).
function readTab(): Tab {
  try {
    const v = window.localStorage.getItem(TAB_KEY);
    return v === 'search' || v === 'group' || v === 'new' ? v : 'new';
  } catch { return 'new'; }
}
function writeTab(t: Tab) { try { window.localStorage.setItem(TAB_KEY, t); } catch { /* sin persistencia */ } }
const TABS: { k: Tab; label: string; Icon: typeof UserPlus }[] = [
  { k: 'new', label: 'Nuevo visitante', Icon: UserPlus },
  { k: 'search', label: 'Buscar / QR', Icon: Search },
  { k: 'group', label: 'Grupo', Icon: Users },
];

// Tipos de grupo en la puerta: colegio (histórico, kind=null) + presets +
// "Otro" con texto libre. Las etiquetas del formulario se adaptan al tipo.
const GROUP_KINDS = ['Colegio', 'Grupo comunitario', 'Empresa / institución', 'Otro'] as const;
type GroupKindSel = (typeof GROUP_KINDS)[number];

function RegisterSheet({ reg, byId, busy, onClose, onSubmit, notice }: {
  notice?: ReactNode; reg: Reg; byId: Record<string, PuertaSala | undefined>; busy: boolean;
  onClose: () => void; onSubmit: (body: unknown, okMsg: OkMsg) => void;
}) {
  const titleId = useId();
  const [tab, setTabState] = useState<Tab>(readTab);
  const setTab = (t: Tab) => { setTabState(t); writeTab(t); };
  const [nv, setNv] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  // Dedup: sugerencias del padrón mientras se escribe (nombre/email/teléfono).
  // "Usar" registra como IDENTIFICADO (misma credencial, +1 visita) en vez de
  // crear un duplicado. NUNCA auto-merge: siempre elige el staff.
  const [dup, setDup] = useState<CheckinVisitorItem[]>([]);
  const [comp, setComp] = useState(0);
  const [g, setG] = useState({ colegio: '', level: '', contactName: '', studentCount: 30 });
  const [gKind, setGKind] = useState<GroupKindSel>('Colegio');
  const [gKindCustom, setGKindCustom] = useState('');

  // Retiene los datos durante la animación de salida (reg pasa a null al cerrar).
  const dataRef = useRef<Reg>(reg);
  if (reg) dataRef.current = reg;
  const salaIds = dataRef.current?.salaIds ?? [];
  const title = salaIds.map((id) => byId[id]?.name).filter(Boolean).join(' + ');

  const busyRef = useRef(busy); busyRef.current = busy;
  const requestClose = useRef(() => {});
  requestClose.current = () => { if (busyRef.current) return; onClose(); };
  const reset = () => { setTabState(readTab()); setNv({ firstName: '', lastName: '', email: '', phone: '' }); setDup([]); setComp(0); setG({ colegio: '', level: '', contactName: '', studentCount: 30 }); setGKind('Colegio'); setGKindCustom(''); };

  // Typeahead de dedup (email > teléfono > nombre completo), debounce 350ms.
  useEffect(() => {
    if (tab !== 'new' || reg === null) { setDup([]); return; }
    const email = nv.email.trim();
    const phone = nv.phone.replace(/\D/g, '');
    const name = `${nv.firstName.trim()} ${nv.lastName.trim()}`.trim();
    const q = email.length >= 3 ? email : phone.length >= 4 ? nv.phone.trim() : name.length >= 5 ? name : '';
    if (!q) { setDup([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await searchCheckinVisitors(q, ctl.signal);
        if (r.ok) setDup(r.data.items.slice(0, 4));
      } catch { /* abort */ }
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nv, tab, reg === null]);

  const { mounted, closing, panelRef } = useDrawerLifecycle({ open: reg !== null, onEscape: () => requestClose.current(), onClosed: reset });
  if (!mounted || typeof document === 'undefined') return null;

  const okMsg = defaultOkMsg;

  return createPortal(
    <div tabIndex={-1} className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => requestClose.current()}
        className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')} />
      <div ref={panelRef} className={cn(
        'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] md:max-h-none rounded-t-2xl border-t border-line bg-surface shadow-xl',
        'md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0',
        'flex flex-col', closing && 'drawer-panel--closing')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Registrar entrada</p>
            <h2 id={titleId} className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-ink">{title || 'Sala permanente'}</h2>
          </div>
          <IconButton label="Cerrar" variant="outline" size="md" onClick={() => requestClose.current()} disabled={busy}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          {/* Pestañas */}
          <div className="mb-4 flex gap-1 rounded-xl bg-surface-container p-1">
            {TABS.map((t) => (
              <Button key={t.k} variant="pill" selected={tab === t.k} className={cn(T44, 'min-w-0 flex-1 px-2 text-[13px]')} onClick={() => { setTab(t.k); setComp(0); /* PUE-A11: el +N de otra pestana no viaja oculto */ }}>
                <t.Icon size={15} /> {t.label}
              </Button>
            ))}
          </div>

          {tab === 'new' ? (
            <form onSubmit={(e) => { e.preventDefault(); onSubmit({ salaIds, mode: 'new', companions: comp, visitor: { firstName: nv.firstName.trim(), lastName: nv.lastName.trim(), email: nv.email.trim() || null, phone: nv.phone.trim() || null } }, okMsg); }}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre" className={FIELD44} autoFocus value={nv.firstName} onChange={(e) => setNv({ ...nv, firstName: e.target.value })} required />
                <Field label="Apellido" className={FIELD44} value={nv.lastName} onChange={(e) => setNv({ ...nv, lastName: e.target.value })} required />
                <Field label="Email (opcional)" className={FIELD44} type="email" value={nv.email} onChange={(e) => setNv({ ...nv, email: e.target.value })} />
                <Field label="Teléfono (opcional)" className={FIELD44} value={nv.phone} onChange={(e) => setNv({ ...nv, phone: e.target.value })} />
              </div>
              {dup.length > 0 ? (
                <div className="mt-3 rounded-xl border border-line bg-surface-container/60 p-3">
                  <p className="text-[12px] font-semibold text-ink">¿Ya está en el padrón? Usa su credencial (no crea duplicado):</p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {dup.map((v) => (
                      <div key={v.code} className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-ink">{v.firstName} {v.lastName}</span>
                          <span className="block text-[11.5px] tabular-nums text-muted">{v.code} · {v.visitCount} {v.visitCount === 1 ? 'visita' : 'visitas'}</span>
                        </span>
                        <Button type="button" variant="secondary" className={T44} disabled={busy}
                          onClick={() => onSubmit({ salaIds, mode: 'identified', code: v.code, companions: comp }, okMsg)}>
                          <UserCheck size={14} /> Usar
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <Companions value={comp} onChange={setComp} />
              <SubmitBtn busy={busy} label={`Registrar entrada${comp > 0 ? ` · ${1 + comp} personas` : ''}`} disabled={!nv.firstName.trim() || !nv.lastName.trim()} />
            </form>
          ) : tab === 'search' ? (
            <PuertaIdentify busy={busy} companions={comp} onCompanions={setComp}
              onRegister={(code) => onSubmit({ salaIds, mode: 'identified', code, companions: comp }, okMsg)} />
          ) : (() => {
            const isCol = gKind === 'Colegio';
            // kind efectivo que viaja al API: null = colegio (semántica histórica).
            const kind = isCol ? null : gKind === 'Otro' ? gKindCustom.trim() : gKind;
            const kindMissing = gKind === 'Otro' && !gKindCustom.trim();
            return (
              <form onSubmit={(e) => { e.preventDefault(); onSubmit({ salaIds, mode: 'group', group: { colegio: g.colegio.trim(), kind, level: g.level.trim() || null, contactName: g.contactName.trim(), studentCount: g.studentCount } }, okMsg); }}>
                <div className="mb-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Tipo de grupo</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {GROUP_KINDS.map((k) => (
                      <Button key={k} variant="pill" className={T44} selected={gKind === k} onClick={() => setGKind(k)} type="button">{k}</Button>
                    ))}
                  </div>
                </div>
                {gKind === 'Otro' ? (
                  <div className="mb-3">
                    <Field label="¿Qué tipo de grupo?" className={FIELD44} autoFocus value={gKindCustom} onChange={(e) => setGKindCustom(e.target.value)} placeholder="Grupo juvenil, iglesia, fundación…" required />
                  </div>
                ) : null}
                <Field label={isCol ? 'Colegio' : 'Nombre del grupo'} className={FIELD44} autoFocus={gKind !== 'Otro'} value={g.colegio} onChange={(e) => setG({ ...g, colegio: e.target.value })} required />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label={isCol ? 'Nivel / grado' : 'Detalle (opcional)'} className={FIELD44} value={g.level} onChange={(e) => setG({ ...g, level: e.target.value })} placeholder={isCol ? '5.º primaria' : 'Sector, edades, comunidad…'} />
                  {/* div, no label: un label activaría su primer control (el botón −) al tocar el texto */}
                  <div className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{isCol ? 'Alumnos' : 'Integrantes'}</span>
                    <Stepper label={isCol ? 'Alumnos' : 'Integrantes'} value={g.studentCount} onChange={(v) => setG({ ...g, studentCount: v })} />
                  </div>
                </div>
                <div className="mt-3">
                  <Field label={isCol ? 'Profesor responsable' : 'Responsable'} className={FIELD44} value={g.contactName} onChange={(e) => setG({ ...g, contactName: e.target.value })} required />
                </div>
                <p className="mb-1 mt-3 rounded-lg bg-success-bg px-3 py-2 text-[12.5px] font-semibold text-success-fg">
                  Se registran 1 {isCol ? 'profesor' : 'responsable'} + {g.studentCount} {isCol ? 'alumnos' : 'integrantes'} = {1 + g.studentCount} visitas.
                </p>
                <SubmitBtn busy={busy} label="Registrar grupo" disabled={!g.colegio.trim() || !g.contactName.trim() || kindMissing} />
              </form>
            );
          })()}

          <Button variant="ghost" className={cn(T44, 'mx-auto mt-3')} onClick={() => onSubmit({ salaIds, mode: 'anonymous', companions: comp }, okMsg)} disabled={busy}>
            Registrar sin datos (anónimo)
          </Button>
        </div>
        {notice}
      </div>
    </div>,
    document.body,
  );
}

function Stepper({ value, onChange, label, min = 0 }: { value: number; onChange: (v: number) => void; label: string; min?: number }) {
  return (
    <NumberField block editable size="kiosk" hideLabel label={label} value={value} onValueChange={onChange} min={min} max={2000}
      className="mt-1" decrementLabel={`Menos ${label.toLowerCase()}`} incrementLabel={`Más ${label.toLowerCase()}`} />
  );
}
export function Companions({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="my-3 flex items-center justify-between rounded-lg border border-line px-3 py-2">
      <span className="text-[13.5px] font-semibold text-ink">Acompañantes <span className="font-normal text-muted">(+1 por cada uno)</span></span>
      <NumberField size="kiosk" editable={false} hideLabel label="Acompañantes" value={value} onValueChange={onChange} min={0} max={10}
        decrementLabel="Menos acompañantes" incrementLabel="Más acompañantes" />
    </div>
  );
}
function SubmitBtn({ busy, label, disabled }: { busy: boolean; label: string; disabled?: boolean }) {
  return (
    <DoorButton type="submit" size="lg" className="mt-1 w-full" disabled={busy || disabled}>
      {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={18} strokeWidth={2.2} />} {label}
    </DoorButton>
  );
}
