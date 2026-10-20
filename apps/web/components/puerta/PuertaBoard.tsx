'use client';

// components/puerta/PuertaBoard.tsx · superficie de PUERTA de las salas
// permanentes (Ada Balcácer, Sala VR). Cada entrada CUENTA (sin cupo/dedup). El
// registro captura al visitante como usuario real (reusa la infra del check-in):
// drawer con pestañas Nuevo visitante / Buscar-QR / Grupo, + "sin datos"
// secundario. La VR además tiene su agenda de colegios (SalaAgenda). El aforo
// físico lo maneja el staff → NO mostramos contador de ocupación. Integrado al
// sistema de diseño (Card/Button/Chip/EmptyState + drawer estándar).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, AlertTriangle, Plus, QrCode, Users, X, UserPlus, DoorOpen, Undo2, RotateCw } from 'lucide-react';
import type { PuertaSala } from '@contan2/contracts';
import { Card, Button, IconButton, Chip, EmptyState, ErrorState, cn } from '../ui';
import { DoorButton } from './DoorButton';
import { SalaAgenda } from './SalaAgenda';
import { EntradasHoy } from './EntradasHoy';
import { salaColor } from './salaColors';

const money = (n: number) => n.toLocaleString('en-US');

import { RegisterSheet, T44, defaultOkMsg, type OkData, type OkMsg, type Reg } from './RegisterSheet';

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
  const [entriesTick, setEntriesTick] = useState(0); // fuerza el refresco de «Entradas de hoy»
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
      setEntriesTick((n) => n + 1);
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
      setEntriesTick((n) => n + 1);
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
          const col = salaColor(s.kind);
          const isVR = s.kind === 'vr';
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

      {/* Entradas de hoy (lista + detalle con Deshacer) y la agenda de las salas que la tienen. */}
      {salas.length > 0 ? (
        <EntradasHoy salas={salas.map((s) => ({ id: s.id, name: s.name }))} refreshKey={entriesTick} onChanged={() => { setEntriesTick((n) => n + 1); void refresh(); }} />
      ) : null}
      {salas.filter((s) => s.hasAgenda).map((s) => (
        <SalaAgenda key={`agenda-${s.id}`} salaId={s.id} salaName={s.name} aforo={s.aforo} />
      ))}

      <RegisterSheet reg={reg} byId={byId} busy={busy} onClose={() => setReg(null)} onSubmit={submit} notice={reg ? notices(true) : null} />
    </div>
  );
}
