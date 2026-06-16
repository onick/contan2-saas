'use client';

// apps/web/components/checkin/CheckinConsole.tsx · consola de check-in REAL del
// staff (Check-in C). Cero demo: métricas/actividades/búsqueda vienen de api-v2 vía
// BFF same-origin; estados honestos loading/error/empty (si la API cae → estado de
// error, NUNCA datos demo). Métricas con polling 30s. Búsqueda server-side con
// debounce 300ms + descarte de respuestas obsoletas (AbortController). Atajo `/`.
// Check-in de visitante existente o nuevo (alta + check-in en una operación) y "+1
// sin credencial" con Idempotency-Key reutilizada en reintentos del MISMO click.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Search, X, UserPlus, Loader2, CheckCircle2, AlertTriangle, RotateCw, Crown, Sparkle, ScanLine, History, Medal, ListChecks, Image as ImageIcon } from 'lucide-react';
import { GuestListDrawer } from './GuestListDrawer';
import { CoverThumb } from '../activities/CoverThumb';
import type { CheckinMetricsResponse, CheckinActivityItem, CheckinVisitorItem, AttendanceListItem } from '@contan2/contracts';
import { getCheckinMetrics, getCheckinActivities, searchCheckinVisitors, postCheckin, postCheckinAnonymous, getRecentCheckins } from '../../lib/api/checkin-client';
import { NewVisitorDrawer } from './NewVisitorDrawer';
import { CheckinScanModal } from './CheckinScanModal';
import { Button, Card, Chip, IconButton, cn, focusRing } from '../ui';
import { RefreshCw } from 'lucide-react';

type Async<T> = { phase: 'loading' | 'ready' | 'error'; data?: T; error?: string };
type Toast = { kind: 'success' | 'error'; msg: string } | null;

// Hora relativa corta para el feed ("ahora", "hace 5 min", "hace 2 h").
// CALIBRADA contra serverNow (patrón v1): los timestamps los sella el server; si
// su reloj difiere del cliente, comparar contra Date.now() miente. skewMs =
// serverNow - clientNow se recalcula en cada poll de métricas.
function timeAgo(iso: string, skewMs: number): string {
  const min = Math.floor((Date.now() + skewMs - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h`;
}

// Strip de métricas (paridad v1, pedido 2026-06-11): una sola línea con las 4
// métricas en vez de 4 tarjetas — el staff las lee de un vistazo en tablet. El
// "EN VIVO" vive SOLO en el pill del header de la página (estaba duplicado);
// con ese espacio entra el reloj local compacto.
// Actividad de HOY (fecha local del dispositivo) → chip naranja (paridad v1).
function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
const fmtHour = (iso: string) => new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });

const METRIC_LABELS: { key: keyof CheckinMetricsResponse['metrics']; label: string }[] = [
  { key: 'checkinsToday', label: 'check-ins hoy' },
  { key: 'checkinsLast10Min', label: 'en últimos 10 min' },
  { key: 'uniqueVisitorsToday', label: 'visitantes únicos' },
  { key: 'activeActivities', label: 'activas' },
];



// Reloj HH:MM local del dispositivo (la tablet de recepción). Tick 30s.
function useLocalClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}

export function CheckinConsole() {
  const clock = useLocalClock();
  const [metrics, setMetrics] = useState<Async<CheckinMetricsResponse['metrics']>>({ phase: 'loading' });
  const [activities, setActivities] = useState<Async<CheckinActivityItem[]>>({ phase: 'loading' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ phase: 'idle' | 'searching' | 'ready' | 'error'; items: CheckinVisitorItem[]; error?: string }>({ phase: 'idle', items: [] });
  const [selected, setSelected] = useState<CheckinVisitorItem | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busyActivity, setBusyActivity] = useState<string | null>(null);
  const [pendingAnon, setPendingAnon] = useState<{ activityId: string; activityName: string; key: string } | null>(null);
  const [anonBusy, setAnonBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [guestListAct, setGuestListAct] = useState<CheckinActivityItem | null>(null);
  const [recent, setRecent] = useState<Async<AttendanceListItem[]>>({ phase: 'loading' });
  const skewMs = useRef(0); // serverNow - clientNow (clock-skew, patrón v1)

  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveId = useId();

  const flash = useCallback((t: Toast) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (t) toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // ── métricas: carga + polling 30s ──
  const loadMetrics = useCallback(async (signal?: AbortSignal) => {
    const r = await getCheckinMetrics(signal).catch((e) => { throw e; });
    if (r.ok) {
      skewMs.current = new Date(r.data.serverNow).getTime() - Date.now();
      setMetrics({ phase: 'ready', data: r.data.metrics });
    }
    else setMetrics((prev) => (prev.data ? { ...prev, phase: 'ready' } : { phase: 'error', error: r.error }));
  }, []);
  const loadActivities = useCallback(async () => {
    const r = await getCheckinActivities();
    if (r.ok) setActivities({ phase: 'ready', data: r.data.items });
    else setActivities((prev) => (prev.data ? { ...prev, phase: 'ready' } : { phase: 'error', error: r.error }));
  }, []);
  // Feed de recepción (check-ins de HOY, recientes primero) — paridad v1.
  const loadRecent = useCallback(async () => {
    const r = await getRecentCheckins();
    if (r.ok) setRecent({ phase: 'ready', data: r.data.items });
    else setRecent((prev) => (prev.data ? { ...prev, phase: 'ready' } : { phase: 'error', error: r.error }));
  }, []);

  useEffect(() => {
    void loadMetrics();
    void loadActivities();
    void loadRecent();
    const id = setInterval(() => { void loadMetrics(); void loadRecent(); }, 30_000);
    return () => clearInterval(id);
  }, [loadMetrics, loadActivities, loadRecent]);

  const refreshLive = useCallback(() => { void loadMetrics(); void loadActivities(); void loadRecent(); }, [loadMetrics, loadActivities, loadRecent]);

  // ── búsqueda: debounce 300ms + abort de respuestas obsoletas ──
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults({ phase: 'idle', items: [] }); return; }
    setResults((r) => ({ ...r, phase: 'searching' }));
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await searchCheckinVisitors(q, ac.signal);
        if (r.ok) setResults({ phase: 'ready', items: r.data.items });
        else setResults({ phase: 'error', items: [], error: r.error });
      } catch { /* abortada → la reemplaza la siguiente */ }
    }, 300);
    return () => { clearTimeout(t); ac.abort(); };
  }, [query]);

  // Escape cierra el confirm de "+1" (a11y), salvo mientras registra.
  useEffect(() => {
    if (!pendingAnon) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !anonBusy) setPendingAnon(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pendingAnon, anonBusy]);

  // ── atajo "/" enfoca la búsqueda (si no estás tipeando en otro campo) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const selectVisitor = (v: CheckinVisitorItem) => { setSelected(v); setQuery(''); setResults({ phase: 'idle', items: [] }); };

  // ── Escaneo de credencial → resolver visitante ──
  // El QR no registra: trae el código y la consola lo busca. Coincidencia exacta
  // de código → selecciona directo; si no, rellena la búsqueda para que el staff
  // elija (o cree el visitante). El check-in real lo hace luego por actividad.
  async function onScanDetect(code: string) {
    setScanOpen(false);
    const r = await searchCheckinVisitors(code).catch(() => null);
    const exact = r?.ok ? r.data.items.find((v) => v.code.toUpperCase() === code.toUpperCase()) : undefined;
    if (exact) {
      selectVisitor(exact);
      flash({ kind: 'success', msg: `${exact.firstName} ${exact.lastName} seleccionado desde la credencial.` });
      return;
    }
    setQuery(code); // rellena la búsqueda → muestra coincidencias o el estado vacío
    if (r?.ok && r.data.items.length === 0) {
      flash({ kind: 'error', msg: `Credencial ${code}: sin coincidencias. Verificá o creá el visitante.` });
    }
  }

  // ── check-in de visitante EXISTENTE ──
  async function registerExisting(act: CheckinActivityItem) {
    if (!selected || busyActivity || act.full) return;
    setBusyActivity(act.id);
    const r = await postCheckin({ activityId: act.id, visitor: { code: selected.code }, companionsChildren: 0 });
    setBusyActivity(null);
    if (r.ok) {
      const proto = r.data.protocol;
      flash({
        kind: 'success',
        msg: proto
          ? `★ PROTOCOLO · ${proto.honorific ? `${proto.honorific} ` : ''}${selected.firstName} registrado en "${act.name}"${proto.plusOnes > 0 ? ` · trae +${proto.plusOnes} acompañantes autorizados` : ''}.`
          : `${selected.firstName} registrado en "${act.name}". Quedó auditado.`,
      });
      setSelected(null);
      refreshLive();
    } else {
      flash({ kind: 'error', msg: r.error });
      if (r.status === 409) refreshLive(); // cupo/dup → refrescar cupos
    }
  }

  // ── "+1 sin credencial": Idempotency-Key se genera al abrir el confirm y se
  //    REUTILIZA en cada reintento de ESTE click (red caída/retry). Cerrar = key nueva.
  function openAnon(act: CheckinActivityItem) {
    if (act.full) return;
    setPendingAnon({ activityId: act.id, activityName: act.name, key: crypto.randomUUID() });
  }
  async function confirmAnon() {
    if (!pendingAnon || anonBusy) return;
    setAnonBusy(true);
    const r = await postCheckinAnonymous(pendingAnon.activityId, pendingAnon.key);
    setAnonBusy(false);
    if (r.ok) {
      flash({ kind: 'success', msg: r.data.replay ? 'Ese ingreso ya estaba registrado.' : `+1 registrado en "${pendingAnon.activityName}". Quedó auditado.` });
      setPendingAnon(null);
      refreshLive();
    } else {
      // NO cerramos: un reintento reusa la MISMA key (no duplica).
      flash({ kind: 'error', msg: r.error });
    }
  }

  return (
    <>
      {/* aria-live para feedback inmediato accesible */}
      <div id={liveId} role="status" aria-live="polite" className="sr-only">{toast?.msg ?? ''}</div>

      {/* Métricas · strip de una línea + reloj local (paridad v1; poll 30s) */}
      <Card padding="md" className="app-reveal mt-6">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
          {metrics.phase === 'error' && !metrics.data ? (
            <span className="text-danger-fg">Métricas no disponibles — reintentá.</span>
          ) : (
            METRIC_LABELS.map((m, i) => (
              <span key={m.key} className="inline-flex items-baseline gap-1.5 text-muted">
                {i > 0 ? <span aria-hidden="true" className="text-faint">·</span> : null}
                <span className="text-[15px] font-bold tabular-nums text-ink">
                  {metrics.data
                    ? metrics.data[m.key]
                    : <span className="inline-block h-4 w-6 animate-pulse rounded bg-surface-container align-middle" />}
                </span>
                {m.label}
              </span>
            ))
          )}
          <span className="ml-auto inline-flex items-center gap-2">
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-[15px] font-bold tabular-nums text-ink">{clock}</span>
              <span className="text-[11px] text-faint">hora local</span>
            </span>
            <IconButton label="Actualizar métricas" variant="ghost" size="sm" onClick={() => refreshLive()}>
              <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
            </IconButton>
          </span>
        </div>
      </Card>

      <div className="app-reveal mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]" style={{ animationDelay: '120ms' }}>
        <div className="flex min-w-0 flex-col gap-4">
          {/* Buscar / seleccionar visitante */}
          <Card padding="lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Encontrar visitante</p>

            {/* Input y acciones (Escanear / Nuevo) en una fila SOLO en desktop (xl, cuando
                el grid pasa a 2 columnas). En tablet/móvil los botones bajan DEBAJO del
                input, a ancho completo (touch-friendly). */}
            <div className="mt-3 flex flex-col gap-2 xl:flex-row xl:items-center">
              {selected ? (
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface-container px-4 py-2.5">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary-container text-[12px] font-semibold text-on-primary-container">
                    {(selected.firstName[0] ?? '') + (selected.lastName[0] ?? '')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {selected.firstName} {selected.lastName}
                      {selected.protocol ? (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 align-[-1px] text-[10.5px] font-bold uppercase tracking-wide text-[#b35400]">
                          <Medal size={10} strokeWidth={2.5} aria-hidden="true" /> Protocolo{selected.protocol.honorific ? ` · ${selected.protocol.honorific}` : ''}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-faint">
                      <span className="tabular-nums">{selected.code}</span>
                      <span className="ml-2 inline-flex items-center gap-1">{selected.visitCount >= 10 ? <Crown size={11} aria-hidden="true" /> : null}{selected.visitCount} {selected.visitCount === 1 ? 'visita' : 'visitas'}</span>
                    </p>
                    {selected.invitedTo && selected.invitedTo.length > 0 ? (
                      <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[10.5px] font-semibold text-success-fg">
                        <CheckCircle2 size={11} strokeWidth={2.5} aria-hidden="true" />
                        <span className="truncate">En la lista{selected.invitedTo.length === 1 ? ` · ${selected.invitedTo[0]!.activityName}` : ` · ${selected.invitedTo.length} actividades`}</span>
                      </p>
                    ) : null}
                  </div>
                  <IconButton label="Quitar visitante" variant="outline" size="sm" onClick={() => setSelected(null)}>
                    <X size={16} strokeWidth={2} aria-hidden="true" />
                  </IconButton>
                </div>
              ) : (
                <label className="relative block min-w-0 flex-1">
                  <span className="sr-only">Buscar visitante por código, nombre, email o teléfono</span>
                  <Search size={18} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Código, nombre, email o teléfono…   ( / )"
                    className={cn('h-12 w-full rounded-xl border border-line bg-page pl-11 pr-4 text-[14px] text-ink placeholder:text-faint', focusRing)}
                  />
                  {results.phase === 'searching' ? <Loader2 size={16} aria-hidden="true" className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-faint" /> : null}
                </label>
              )}
              <div className="flex flex-none items-stretch gap-2">
                <Button variant="secondary" size="md" onClick={() => setScanOpen(true)} className="flex-1 xl:flex-none">
                  <ScanLine size={16} strokeWidth={2} aria-hidden="true" /> Escanear
                </Button>
                <Button variant="primary" size="md" onClick={() => setNewOpen(true)} className="flex-1 xl:flex-none">
                  <UserPlus size={16} strokeWidth={2} aria-hidden="true" /> Nuevo visitante
                </Button>
              </div>
            </div>

            {!selected && (query.trim().length >= 2 ? (
              <div className="mt-2">
                {results.phase === 'error' ? (
                  <p className="px-1 py-2 text-[13px] text-danger-fg">{results.error}</p>
                ) : results.phase === 'ready' && results.items.length === 0 ? (
                  <p className="px-1 py-2 text-[13px] text-faint">Sin coincidencias. Probá otro dato o creá el visitante.</p>
                ) : (
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                    {results.items.map((v) => (
                      <li key={v.id}>
                        <button type="button" onClick={() => selectVisitor(v)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-container', focusRing)}>
                          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary-container text-[11px] font-semibold text-on-primary-container">{(v.firstName[0] ?? '') + (v.lastName[0] ?? '')}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {v.firstName} {v.lastName}
                              {v.protocol ? (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-0.5 align-[-1px] text-[10px] font-bold uppercase tracking-wide text-[#b35400]">
                                  <Medal size={9} strokeWidth={2.5} aria-hidden="true" /> Protocolo
                                </span>
                              ) : null}
                            </span>
                            <span className="block truncate text-xs text-faint"><span className="tabular-nums">{v.code}</span>{v.email ? ` · ${v.email}` : ''}</span>
                            {v.invitedTo && v.invitedTo.length > 0 ? (
                              <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-success-bg px-1.5 py-0.5 text-[10px] font-semibold text-success-fg">
                                <CheckCircle2 size={10} strokeWidth={2.5} aria-hidden="true" />
                                <span className="truncate">En la lista{v.invitedTo.length === 1 ? ` · ${v.invitedTo[0]!.activityName}` : ` · ${v.invitedTo.length} actividades`}</span>
                              </span>
                            ) : null}
                          </span>
                          <Chip tone="neutral" className="flex-none tabular-nums">{v.visitCount === 1 ? '1ª vez' : `${v.visitCount}v`}</Chip>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-muted">Buscá por código o datos del visitante (mín. 2 caracteres).</p>
            ))}
          </Card>

          {/* Listas de invitados · solo actividades activas con lista (guestList) */}
          {activities.data && activities.data.some((a) => a.guestList) ? (
            <Card padding="none">
              <div className="flex items-center gap-2 px-5 py-4 md:px-6">
                <ListChecks size={16} strokeWidth={2} className="text-brand" aria-hidden="true" />
                <h3 className="text-[15px] font-semibold tracking-tight text-ink">Listas de invitados</h3>
              </div>
              <ul>
                {activities.data.filter((a) => a.guestList).map((a) => {
                  const gl = a.guestList!;
                  const pct = gl.total > 0 ? Math.round((gl.arrived / gl.total) * 100) : 0;
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-5 py-4 md:px-6">
                      <span className="block h-11 w-[72px] flex-none overflow-hidden rounded-lg bg-surface-container">
                        <CoverThumb
                          src={a.imageUrl ?? null}
                          posY={a.imagePosY}
                          alt=""
                          className="h-full w-full object-cover"
                          fallback={<span className="grid h-full w-full place-items-center text-faint"><ImageIcon size={16} strokeWidth={1.75} aria-hidden="true" /></span>}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium tracking-tight text-ink">{a.name}</p>
                        <p className="mt-0.5 text-xs text-faint">{a.location} · <span className="tabular-nums">{fmtHour(a.date)}</span></p>
                      </div>
                      <div className="min-w-[180px] flex-1 sm:flex-none">
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-container" aria-hidden="true">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-brand), var(--color-brand-accent))' }} />
                        </div>
                        <p className="mt-1.5 text-xs text-faint"><span className="font-semibold text-ink tabular-nums">{gl.arrived}</span> de {gl.total} llegaron · {Math.max(0, gl.total - gl.arrived)} pendientes</p>
                      </div>
                      <Button size="sm" variant="secondary" className="flex-none" onClick={() => setGuestListAct(a)}>
                        <ListChecks size={15} strokeWidth={2} aria-hidden="true" /> Abrir lista
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {/* Actividades activas (reales) */}
          <Card padding="none">
            <div className="flex items-center justify-between px-5 py-4 md:px-6">
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">Actividades activas</h3>
              <div className="flex items-center gap-2">
                {activities.data ? <Chip tone="neutral" className="tabular-nums">{activities.data.length}</Chip> : null}
                <IconButton label="Refrescar" variant="outline" size="sm" onClick={refreshLive}><RotateCw size={15} strokeWidth={2} aria-hidden="true" /></IconButton>
              </div>
            </div>
            {activities.phase === 'error' && !activities.data ? (
              <p className="px-5 py-6 text-[13px] text-danger-fg md:px-6">{activities.error ?? 'No pudimos cargar las actividades.'}</p>
            ) : activities.phase === 'loading' ? (
              <p className="px-5 py-6 text-[13px] text-faint md:px-6">Cargando actividades…</p>
            ) : activities.data && activities.data.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-faint md:px-6">No hay actividades activas ahora mismo.</p>
            ) : (
              <ul>
                {activities.data?.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4 md:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium tracking-tight text-ink">
                        <span className="truncate">{a.name}</span>
                        {isToday(a.date) ? (
                          <span className="flex-none rounded-md bg-brand-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Hoy</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-faint">
                        {a.location} · <span className="tabular-nums">{fmtHour(a.date)}</span> · <span className="tabular-nums">{a.enrolledCount}/{a.capacity}</span> ({a.occupancyPct}%)
                        {a.recentMovement > 0 ? <span className="ml-2 text-success-fg">+{a.recentMovement} en 10 min</span> : null}
                        {a.full ? <span className="ml-2 font-semibold text-danger-fg">Lleno</span> : null}
                      </p>
                    </div>
                    <div className="flex flex-none items-center gap-2">
                      {/* Armado → naranja ACENTO. style inline: cn no hace
                          tailwind-merge y el bg del variant ganaba por orden CSS. */}
                      <Button size="sm" disabled={!selected || a.full || busyActivity === a.id} onClick={() => registerExisting(a)}
                        style={selected && !a.full ? { backgroundColor: 'var(--color-brand-accent)' } : undefined}>
                        {busyActivity === a.id ? <Loader2 size={15} aria-hidden="true" className="animate-spin" /> : <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />} Registrar
                      </Button>
                      <Button variant="secondary" size="sm" disabled={a.full} onClick={() => openAnon(a)}>
                        <Sparkle size={15} strokeWidth={2} aria-hidden="true" /> +1 sin credencial
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Panel derecho: toast (si hay) + FEED de check-ins de hoy (paridad v1) */}
        <div className="min-w-0 space-y-4">
          {toast ? (
            <div role="alert" className={cn('flex items-start gap-2 rounded-xl border px-4 py-3 text-[13px]', toast.kind === 'success' ? 'border-success-fg/30 bg-success-bg text-success-fg' : 'border-danger-fg/30 bg-danger-bg text-danger-fg')}>
              {toast.kind === 'success' ? <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" /> : <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" />}
              <span>{toast.msg}</span>
            </div>
          ) : null}

          <Card padding="none">
            <div className="flex items-center justify-between px-5 py-4">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
                <History size={16} strokeWidth={1.75} aria-hidden="true" /> Check-ins de hoy
              </h3>
              {recent.data ? <Chip tone="neutral" className="tabular-nums">{recent.data.length}</Chip> : null}
            </div>
            {recent.phase === 'error' && !recent.data ? (
              <p className="px-5 pb-5 text-[13px] text-danger-fg">{recent.error ?? 'No pudimos cargar el feed.'}</p>
            ) : recent.phase === 'loading' ? (
              <p className="px-5 pb-5 text-[13px] text-faint">Cargando…</p>
            ) : recent.data && recent.data.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-faint">Aún no hay check-ins hoy. Buscá o creá un visitante y registralo: aparecerá acá al instante.</p>
            ) : (
              <ul>
                {recent.data?.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5">
                    <span className={cn('grid h-8 w-8 flex-none place-items-center rounded-full text-[11px] font-semibold', r.anonymous ? 'bg-surface-container text-faint' : 'bg-primary-container text-on-primary-container')}>
                      {r.anonymous ? <Sparkle size={13} strokeWidth={2} aria-hidden="true" /> : `${r.firstName?.[0] ?? ''}${r.lastName?.[0] ?? ''}`}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {r.anonymous ? '+1 sin credencial' : `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()}
                      </span>
                      <span className="block truncate text-[11px] text-faint">{r.activityName}</span>
                    </span>
                    <span className="flex-none text-[11px] tabular-nums text-faint">{timeAgo(r.registeredAt, skewMs.current)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Confirmación "+1 sin credencial" (Idempotency-Key reutilizada en reintentos) */}
      {pendingAnon ? (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="anon-title">
          <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!anonBusy) setPendingAnon(null); }} className="absolute inset-0 bg-ink/40" />
          <div className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-xl">
            <h3 id="anon-title" className="text-base font-bold tracking-tight text-ink">Registrar +1 sin credencial</h3>
            <p className="mt-1.5 text-[13px] text-muted">Suma un ingreso anónimo a “{pendingAnon.activityName}”. No crea usuario ni código; queda auditado.</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPendingAnon(null)} disabled={anonBusy}>Cancelar</Button>
              <Button type="button" autoFocus onClick={confirmAnon} disabled={anonBusy}>
                {anonBusy ? <><Loader2 size={15} aria-hidden="true" className="animate-spin" /> Registrando…</> : 'Sí, registrar +1'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <CheckinScanModal open={scanOpen} onClose={() => setScanOpen(false)} onDetect={onScanDetect} />

      <NewVisitorDrawer
        open={newOpen}
        activities={activities.data ?? []}
        initialName={query}
        onClose={() => setNewOpen(false)}
        onDone={(msg) => { setNewOpen(false); flash({ kind: 'success', msg }); refreshLive(); }}
      />

      <GuestListDrawer
        activity={guestListAct ? (activities.data?.find((a) => a.id === guestListAct.id) ?? guestListAct) : null}
        onClose={() => setGuestListAct(null)}
        onArrival={refreshLive}
      />
    </>
  );
}
