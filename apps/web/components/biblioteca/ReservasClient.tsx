'use client';

// components/biblioteca/ReservasClient.tsx · RESERVAS (F5)
// F8b: tabla → DataTableClient; tabs → Tabs del kit; drawer → Sheet.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bookmark, History, Search, Loader2, Check, X, ChevronLeft, ChevronRight,
  BookOpen, Clock3, Plus, QrCode, MapPin, HandHelping, Ban, ListOrdered,
} from 'lucide-react';
import type {
  BiblioReservationsListResponse, BiblioReservation, BiblioReservationsSummary,
  BiblioTitlesListResponse, BiblioLoan,
} from '@contan2/contracts';
import {
  Card, Button, IconButton, Chip, EmptyState, SectionHeader, Sheet,
  Tabs, TabsContent, DataTableClient, cn, focusRing,
} from '../ui';
import type { DataTableColumn } from '../ui';
import { BibliotecaTabsNav } from './BibliotecaTabsNav';

const fmt = (n: number) => n.toLocaleString('en-US');
const fmtDate = (iso: string) => new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));

function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  if (current > 3) out.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p += 1) out.push(p);
  if (current < total - 2) out.push('…');
  out.push(total);
  return out;
}

function pickupLabel(expiresAt: string): { text: string; urgent: boolean } {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 1) return { text: 'Hoy', urgent: true };
  return { text: `${days} días`, urgent: false };
}

export function ReservationStatusChip({ r }: { r: BiblioReservation }) {
  switch (r.status) {
    case 'lista': return <Chip tone="success" dot>Lista para retirar</Chip>;
    case 'espera': return <Chip tone="brand">En espera{r.position ? ` · Posición ${r.position}` : ''}</Chip>;
    case 'cumplida': return <Chip tone="neutral">Cumplida</Chip>;
    case 'cancelada': return <Chip tone="neutral">Cancelada</Chip>;
    default: return <Chip tone="danger" dot>Vencida</Chip>;
  }
}

const RESERVAS_TABS = [
  { value: 'activas', label: 'Reservas activas' },
  { value: 'espera', label: 'Lista de espera' },
  { value: 'historial', label: 'Historial' },
];

export function ReservasClient({ initial, initialSummary }: {
  initial: BiblioReservationsListResponse; initialSummary: BiblioReservationsSummary | null;
}) {
  const [data, setData] = useState(initial);
  const [summary, setSummary] = useState(initialSummary);
  const [tab, setTab] = useState<string>('activas');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const first = useRef(true);
  const pageSize = 20;
  const nuevaReservaBtnRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ tab, page: String(page), pageSize: String(pageSize) });
      if (q.trim()) p.set('q', q.trim());
      const res = await fetch(`/app/biblioteca/api/reservations?${p.toString()}`, { cache: 'no-store', signal });
      if (res.ok) setData(await res.json() as BiblioReservationsListResponse);
      const s = await fetch('/app/biblioteca/api/reservations/summary', { cache: 'no-store', signal });
      if (s.ok) setSummary(await s.json() as BiblioReservationsSummary);
    } catch { /* abort */ } finally { setLoading(false); }
  }, [tab, page, q]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const ctl = new AbortController();
    const t = setTimeout(() => { void refresh(ctl.signal); }, q ? 300 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [refresh, q]);

  async function entregar(r: BiblioReservation) {
    if (!r.inventoryCode) return;
    setBusyRow(r.id); setRowError(null);
    try {
      const res = await fetch('/app/biblioteca/api/loans', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: r.userId, inventoryCode: r.inventoryCode, kind: 'domicilio' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.loan) { setRowError(j.error ?? 'No se pudo entregar.'); return; }
      const loan = j.loan as BiblioLoan;
      setFlash(`Entregado: «${r.title}» a ${r.userFirstName} ${r.userLastName} — vence el ${fmtDate(loan.dueAt)}.`);
      void refresh();
    } catch { setRowError('Problema de red. Intenta de nuevo.'); }
    finally { setBusyRow(null); }
  }

  async function cancelar(r: BiblioReservation) {
    setBusyRow(r.id); setRowError(null);
    try {
      const res = await fetch(`/app/biblioteca/api/reservations/${r.id}/cancel`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.reservation) { setRowError(j.error ?? 'No se pudo cancelar.'); return; }
      setFlash(`Cancelada la reserva de «${r.title}» (${r.code}).`);
      void refresh();
    } catch { setRowError('Problema de red. Intenta de nuevo.'); }
    finally { setBusyRow(null); }
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const columns: DataTableColumn<BiblioReservation>[] = [
    {
      id: 'reserva',
      header: 'Reserva',
      cell: (r) => (
        <span>
          <span className="flex items-center gap-1.5 font-mono text-[12px] font-bold tabular-nums text-ink"><Bookmark size={12} className="text-brand-text" aria-hidden="true" /> {r.code}</span>
          <span className="block pl-[18px] text-[11px] tabular-nums text-faint">{fmtDate(r.createdAt)}</span>
        </span>
      ),
    },
    {
      id: 'lector',
      header: 'Lector',
      cell: (r) => (
        <span>
          <span className="block max-w-[150px] truncate text-[13px] font-bold leading-tight text-ink">{r.userFirstName} {r.userLastName}</span>
          <span className="block font-mono text-[10.5px] text-faint tabular-nums">{r.userCode}</span>
        </span>
      ),
    },
    {
      id: 'material',
      header: 'Material',
      cell: (r) => (
        <Link href={`/app/biblioteca/titulos/${r.titleId}`} className={cn('flex items-center gap-2.5 rounded-lg', focusRing)}>
          <span className="grid h-11 w-8 flex-none place-items-center overflow-hidden rounded border border-line/60 bg-brand-accent">
            {r.coverUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={r.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              : <BookOpen size={13} className="text-white/85" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block max-w-[180px] truncate text-[13px] font-bold leading-tight text-ink hover:text-brand-text">{r.title}</span>
            <span className="block max-w-[180px] truncate text-[11px] text-muted">{r.authors[0] ?? ''}</span>
            {r.inventoryCode ? <span className="block font-mono text-[10.5px] text-faint tabular-nums">Inv. {r.inventoryCode}</span> : null}
          </span>
        </Link>
      ),
    },
    {
      id: 'ubicacion',
      header: 'Ubicación',
      priority: 'lg',
      cell: (r) => (
        r.siteName ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
            <MapPin size={12} className="flex-none text-faint" aria-hidden="true" /> {r.siteName}{r.shelf ? ` · ${r.shelf}` : ''}
          </span>
        ) : <span className="text-[12px] text-faint">—</span>
      ),
    },
    {
      id: 'estado',
      header: 'Estado',
      priority: 'md',
      cell: (r) => <ReservationStatusChip r={r} />,
    },
    {
      id: 'retiro',
      header: 'Retiro',
      priority: 'md',
      cell: (r) => (
        r.status === 'lista' && r.expiresAt ? (
          <span className="text-[12.5px] tabular-nums text-muted">
            {fmtDate(r.expiresAt)}
            {(() => { const p = pickupLabel(r.expiresAt); return <span className={cn('block text-[10.5px] font-bold', p.urgent ? 'text-danger-fg' : 'text-faint')}>{p.text}</span>; })()}
          </span>
        ) : <span className="text-[12.5px] text-faint">—</span>
      ),
    },
    {
      id: 'acciones',
      header: '',
      align: 'right',
      width: 80,
      cell: (r) => (
        (r.status === 'lista' || r.status === 'espera') ? (
          <span className="flex items-center justify-end gap-1">
            {r.status === 'lista' && r.inventoryCode ? (
              <button type="button" disabled={busyRow === r.id} onClick={() => entregar(r)}
                title="Entregar (prestar el ejemplar apartado)" aria-label={`Entregar ${r.title}`}
                className={cn('inline-grid h-8 w-8 place-items-center rounded-lg text-success-fg hover:bg-success-bg', focusRing)}>
                {busyRow === r.id ? <Loader2 size={15} className="animate-spin" /> : <HandHelping size={16} strokeWidth={2} />}
              </button>
            ) : null}
            <button type="button" disabled={busyRow === r.id} onClick={() => cancelar(r)}
              title="Cancelar reserva" aria-label={`Cancelar reserva de ${r.title}`}
              className={cn('inline-grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-danger-bg hover:text-danger-fg', focusRing)}>
              <Ban size={14} strokeWidth={2} />
            </button>
          </span>
        ) : null
      ),
    },
  ];

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_290px] xl:items-start xl:gap-5">
      <div className="min-w-0">
        <div className="app-reveal">
          <SectionHeader
            level={1}
            title="Reservas"
            subtitle="Cola de espera por título: al liberarse una copia, se aparta sola para el primero de la fila."
            actions={<Button ref={nuevaReservaBtnRef} variant="primary" onClick={() => setDrawer(true)}><Plus size={16} strokeWidth={2.2} /> Nueva reserva</Button>}
          />
        </div>
        <BibliotecaTabsNav />

        {/* ── Tabs del kit ── */}
        <div className="app-reveal mt-4" style={{ animationDelay: '30ms' }}>
          <Tabs
            value={tab}
            onValueChange={(v) => { setTab(v); setPage(1); }}
            tabs={RESERVAS_TABS}
          >
            <TabsContent value={tab} className="flex flex-col gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            {/* ── Búsqueda ── */}
            <label className={cn('flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5', focusRing)}>
              <Search size={16} className="text-faint" aria-hidden="true" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="Buscar por título, lector, carné o código de reserva (R-000123)…" aria-label="Buscar reservas"
                className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint" />
              {loading ? <Loader2 size={15} className="animate-spin text-faint" /> : null}
            </label>

            {flash ? <p role="status" className="rounded-xl bg-success-bg px-4 py-2.5 text-[13px] font-semibold text-success-fg">✓ {flash}</p> : null}
            {rowError ? <p role="status" className="rounded-xl bg-danger-bg px-4 py-2.5 text-[13px] font-semibold text-danger-fg">{rowError}</p> : null}

            <p className="text-[14px] font-bold text-ink" aria-live="polite">
              {fmt(data.total)} {data.total === 1 ? 'reserva' : 'reservas'}{tab === 'activas' ? ' activas' : tab === 'espera' ? ' en espera' : ''}
            </p>

            <div className={cn('transition-opacity', loading && 'opacity-50')}>
              <DataTableClient
                data={data.reservations}
                columns={columns}
                getRowId={(r) => r.id}
                ariaLabel="Lista de reservas"
                empty={
                  <EmptyState icon={Bookmark}
                    title={q ? 'Sin resultados' : 'No hay reservas por acá'}
                    description={q ? 'Prueba con otro título, lector o código.' : 'Cuando una obra esté toda prestada, resérvala: al volver una copia se aparta sola.'}
                    action={<Button variant="primary" onClick={() => setDrawer(true)}><Plus size={15} /> Nueva reserva</Button>} />
                }
                mobileCard={(r) => (
                  <div className="flex items-center gap-3 p-4">
                    <span className="grid h-10 w-7 flex-none place-items-center overflow-hidden rounded border border-line/60 bg-brand-accent">
                      {r.coverUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={r.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        : <BookOpen size={12} className="text-white/85" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-ink">{r.title}</p>
                      <p className="truncate text-[11px] text-muted">{r.userFirstName} {r.userLastName} · {r.code}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <ReservationStatusChip r={r} />
                        {r.status === 'lista' && r.expiresAt ? (
                          <span className={cn('text-[10.5px] font-bold', pickupLabel(r.expiresAt).urgent ? 'text-danger-fg' : 'text-faint')}>
                            {pickupLabel(r.expiresAt).text}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {(r.status === 'lista' || r.status === 'espera') ? (
                      <span className="flex flex-col gap-1">
                        {r.status === 'lista' && r.inventoryCode ? (
                          <button type="button" disabled={busyRow === r.id} onClick={() => entregar(r)}
                            aria-label={`Entregar ${r.title}`}
                            className={cn('inline-grid h-8 w-8 place-items-center rounded-lg text-success-fg hover:bg-success-bg', focusRing)}>
                            <HandHelping size={15} strokeWidth={2} />
                          </button>
                        ) : null}
                        <button type="button" disabled={busyRow === r.id} onClick={() => cancelar(r)}
                          aria-label={`Cancelar reserva de ${r.title}`}
                          className={cn('inline-grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-danger-bg hover:text-danger-fg', focusRing)}>
                          <Ban size={13} strokeWidth={2} />
                        </button>
                      </span>
                    ) : null}
                  </div>
                )}
              />

              {pages > 1 ? (
                <nav className="mt-3.5 flex items-center justify-center gap-1" aria-label="Paginación">
                  <IconButton label="Página anterior" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft size={15} />
                  </IconButton>
                  {pageWindow(data.page, pages).map((p, i) => p === '…' ? (
                    <span key={`e${i}`} className="px-1 text-faint">…</span>
                  ) : (
                    <button key={p} type="button" onClick={() => setPage(p)} aria-current={p === data.page ? 'page' : undefined}
                      className={cn('grid h-8 min-w-8 place-items-center rounded-lg px-1 text-[12.5px] font-bold tabular-nums', focusRing,
                        p === data.page ? 'bg-brand text-brand-fg' : 'text-muted hover:bg-surface-container')}>
                      {p}
                    </button>
                  ))}
                  <IconButton label="Página siguiente" variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight size={15} />
                  </IconButton>
                </nav>
              ) : null}
            </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ── Carril derecho ── */}
      <aside className="mt-5 xl:mt-0">
        {summary ? (
          <>
            <Card padding="md" className="app-reveal" style={{ animationDelay: '60ms' }}>
              <h2 className="text-[14px] font-bold tracking-tight text-ink">Resumen de reservas</h2>
              <dl className="mt-2 divide-y divide-line/60">
                <SummaryRow label="Reservas activas" value={summary.activas} tone="text-ink" />
                <SummaryRow label="En lista de espera" value={summary.enEspera} tone="text-ink" />
                <SummaryRow label="Listas para retirar" value={summary.paraRetirar} tone="text-success-fg" />
                <SummaryRow label="Vencen hoy" value={summary.vencenHoy} tone={summary.vencenHoy > 0 ? 'text-danger-fg' : 'text-ink'} />
              </dl>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-faint">Ventana de retiro: {summary.policy.pickupDays} días · máx. {summary.policy.maxActivePerReader} reservas activas por lector.</p>
            </Card>

            {summary.proximas.length > 0 ? (
              <Card padding="md" className="app-reveal mt-4" style={{ animationDelay: '90ms' }}>
                <h2 className="text-[14px] font-bold tracking-tight text-ink">Próximas para retirar</h2>
                <ul className="mt-2 divide-y divide-line/60">
                  {summary.proximas.map((p) => {
                    const lbl = pickupLabel(p.expiresAt);
                    return (
                      <li key={p.id} className="flex items-center gap-2.5 py-2">
                        <span className="grid h-10 w-7 flex-none place-items-center overflow-hidden rounded border border-line/60 bg-brand-accent">
                          {p.coverUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={p.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                            : <BookOpen size={12} className="text-white/85" aria-hidden="true" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-bold leading-tight text-ink">{p.title}</span>
                          <span className="block truncate text-[11px] text-muted">{p.userFirstName} {p.userLastName}</span>
                        </span>
                        <span className={cn('flex-none text-[11.5px] font-extrabold', lbl.urgent ? 'text-danger-fg' : 'text-muted')}>{lbl.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}

            <Card padding="md" className="app-reveal mt-4" style={{ animationDelay: '120ms' }}>
              <h2 className="flex items-center gap-1.5 text-[14px] font-bold tracking-tight text-ink"><Clock3 size={14} className="text-brand-text" /> Cómo funciona</h2>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                Al devolverse una copia, la reserva más antigua pasa sola a <b className="text-ink">Lista para retirar</b> con un ejemplar apartado.
                Si no la retiran en {summary.policy.pickupDays} días, vence y la copia pasa al siguiente de la fila.
              </p>
            </Card>
          </>
        ) : null}
      </aside>

      <NewReservationDrawer
        open={drawer}
        returnFocusRef={nuevaReservaBtnRef}
        onClose={() => setDrawer(false)}
        onDone={(msg) => { setDrawer(false); setFlash(msg); void refresh(); }}
      />
    </div>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className={cn('text-[15px] font-extrabold tabular-nums', tone)}>{fmt(value)}</dd>
    </div>
  );
}

// ── Nueva reserva → Sheet del kit ────────────────────────────────────────────
function NewReservationDrawer({ open, onClose, onDone, returnFocusRef }: {
  open: boolean; onClose: () => void; onDone: (msg: string) => void;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const [readerCode, setReaderCode] = useState('');
  const [titleQ, setTitleQ] = useState('');
  const [options, setOptions] = useState<{ id: string; title: string; authors: string[]; coverUrl: string | null; libres: number }[]>([]);
  const [picked, setPicked] = useState<{ id: string; title: string; libres: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReaderCode(''); setTitleQ(''); setOptions([]); setPicked(null); setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || picked || titleQ.trim().length < 2) { setOptions([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/app/biblioteca/api/titles?q=${encodeURIComponent(titleQ.trim())}&pageSize=6`, { cache: 'no-store', signal: ctl.signal });
        if (res.ok) {
          const j = await res.json() as BiblioTitlesListResponse;
          setOptions(j.titles.map((x) => ({
            id: x.id, title: x.title, authors: x.authors, coverUrl: x.coverUrl,
            libres: Math.max(0, x.itemsActive - x.itemsLoaned),
          })));
        }
      } catch { /* abort */ } finally { setSearching(false); }
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [open, titleQ, picked]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !picked || !readerCode.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/app/biblioteca/api/reservations', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ readerCode: readerCode.trim(), titleId: picked.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.reservation) { setError(j.error ?? 'No se pudo crear la reserva.'); setBusy(false); return; }
      const r = j.reservation as BiblioReservation;
      setBusy(false);
      onDone(r.status === 'lista'
        ? `«${r.title}» quedó LISTA PARA RETIRAR (${r.inventoryCode}) — vence el ${r.expiresAt ? fmtDate(r.expiresAt) : ''}.`
        : `«${r.title}» reservada para ${r.userFirstName} ${r.userLastName} — posición ${r.position ?? '…'} en la fila.`);
    } catch { setError('Problema de red. Intenta de nuevo.'); setBusy(false); }
  }

  return (
    <Sheet
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title="Nueva reserva"
      dismissOnOverlay={false}
      returnFocusRef={returnFocusRef as React.RefObject<HTMLElement | null>}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="block">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint"><QrCode size={12} /> Carné del lector</span>
          <input value={readerCode} onChange={(e) => setReaderCode(e.target.value)} placeholder="Escanea o escribe el código — CCB-…" autoFocus
            className={cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[14px] text-ink', focusRing)} />
        </label>

        <label className="block">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint"><Search size={12} /> Obra a reservar</span>
          {picked ? (
            <span className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-container/50 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-bold text-ink">{picked.title}</span>
                <span className={cn('block text-[11.5px] font-semibold', picked.libres > 0 ? 'text-success-fg' : 'text-muted')}>
                  {picked.libres > 0 ? `${picked.libres} copia(s) libre(s) — quedará lista al instante` : 'Todo prestado — entra a la fila de espera'}
                </span>
              </span>
              <IconButton label="Quitar título" variant="outline" size="sm" onClick={() => { setPicked(null); setTitleQ(''); }}><X size={14} /></IconButton>
            </span>
          ) : (
            <>
              <span className="relative mt-1 block">
                <input value={titleQ} onChange={(e) => setTitleQ(e.target.value)} placeholder="Busca por título, autor o ISBN…"
                  className={cn('min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink', focusRing)} />
                {searching ? <Loader2 size={15} className="absolute right-3 top-3.5 animate-spin text-faint" /> : null}
              </span>
              {options.length > 0 ? (
                <ul className="mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
                  {options.map((o) => (
                    <li key={o.id}>
                      <button type="button" onClick={() => setPicked({ id: o.id, title: o.title, libres: o.libres })}
                        className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-container', focusRing)}>
                        <span className="grid h-10 w-7 flex-none place-items-center overflow-hidden rounded border border-line/60 bg-brand-accent">
                          {o.coverUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={o.coverUrl} alt="" className="h-full w-full object-cover" />
                            : <BookOpen size={12} className="text-white/85" aria-hidden="true" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-ink">{o.title}</span>
                          <span className="block truncate text-[11px] text-muted">{o.authors[0] ?? ''}</span>
                        </span>
                        <span className={cn('flex-none text-[10.5px] font-bold', o.libres > 0 ? 'text-success-fg' : 'text-warning-fg')}>
                          {o.libres > 0 ? `${o.libres} libre(s)` : 'Todo prestado'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </label>

        {error ? <p role="status" className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger-fg">{error}</p> : null}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !picked || !readerCode.trim()}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={2.2} />} Crear reserva
        </Button>
        <p className="text-center text-[12px] text-muted">Si hay copia libre, queda apartada al instante con su ventana de retiro.</p>
      </form>
    </Sheet>
  );
}
