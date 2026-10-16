'use client';

// components/biblioteca/LectoresClient.tsx · LECTORES de la Biblioteca
// F8b: tabla → DataTableClient; drawer → Sheet (foco atrapado, no cierra con clic fuera).

import { useEffect, useRef, useState } from 'react';
import {
  Users, UserCheck, UserPlus, UserX, Search, Loader2, Check, X, Eye,
  ChevronLeft, ChevronRight, Upload, Plus, Pencil, IdCard, QrCode,
} from 'lucide-react';
import type {
  BiblioReadersListResponse, BiblioReadersStatsResponse, BiblioReader, BiblioReaderType,
  BiblioLoan, BiblioReservation,
} from '@contan2/contracts';
import { LoanStatusChip } from './CirculacionClient';
import { ReservationStatusChip } from './ReservasClient';
import {
  Card, Button, IconButton, Field, Chip, EmptyState, SectionHeader, Sheet,
  Tabs, TabsContent, DataTableClient, cn, focusRing,
} from '../ui';
import type { DataTableColumn } from '../ui';

const fmt = (n: number) => n.toLocaleString('en-US');
const fmtDate = (iso: string) => new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
const initials = (a: string, b: string) => `${a[0] ?? ''}${b[0] ?? ''}`.toUpperCase() || '?';

function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  if (current > 3) out.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p += 1) out.push(p);
  if (current < total - 2) out.push('…');
  out.push(total);
  return out;
}

function estadoDe(r: BiblioReader): { label: string; tone: 'success' | 'danger' | 'neutral' } {
  if (r.archived) return { label: 'Archivado', tone: 'neutral' };
  if (r.suspendedAt) return { label: 'Suspendido', tone: 'danger' };
  return { label: 'Activo', tone: 'success' };
}

export function LectoresClient({ initial, initialStats }: {
  initial: BiblioReadersListResponse; initialStats: BiblioReadersStatsResponse | null;
}) {
  const [data, setData] = useState(initial);
  const [stats, setStats] = useState(initialStats);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<BiblioReader | null>(null);
  const [drawer, setDrawer] = useState(false);
  const first = useRef(true);
  const newLectorBtnRef = useRef<HTMLButtonElement>(null);

  async function refreshStats() {
    try {
      const res = await fetch('/app/biblioteca/api/readers/stats', { cache: 'no-store' });
      if (res.ok) setStats(await res.json() as BiblioReadersStatsResponse);
    } catch { /* señal secundaria */ }
  }

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (q.trim()) p.set('q', q.trim());
        if (type) p.set('type', type);
        if (estado) p.set('estado', estado);
        const res = await fetch(`/app/biblioteca/api/readers?${p.toString()}`, { cache: 'no-store', signal: ctl.signal });
        if (res.ok) setData(await res.json() as BiblioReadersListResponse);
      } catch { /* abort */ } finally { setLoading(false); }
    }, q ? 300 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, type, estado, page, pageSize]);

  function applyUpdated(reader: BiblioReader) {
    setSelected(reader);
    setData((d) => ({ ...d, readers: d.readers.map((x) => x.userId === reader.userId ? reader : x) }));
    void refreshStats();
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const hasFilters = !!(q.trim() || type || estado);
  const limpiar = () => { setQ(''); setType(''); setEstado(''); setPage(1); };
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.total, data.page * data.pageSize);
  const pct = stats && stats.total > 0 ? Math.round((stats.active / stats.total) * 1000) / 10 : null;

  const kpis = stats ? [
    { label: 'Lectores totales', value: stats.total, Icon: Users, tint: 'bg-brand/10 text-brand-text', foot: 'Ver todos', onClick: limpiar },
    { label: 'Activos', value: stats.active, Icon: UserCheck, tint: 'bg-success-bg text-success-fg', foot: pct !== null ? `${pct}% del total` : undefined },
    { label: 'Nuevos este mes', value: stats.newThisMonth, Icon: UserPlus, tint: 'bg-info-soft text-info-text' },
    { label: 'Suspendidos', value: stats.suspended, Icon: UserX, tint: 'bg-danger-bg text-danger-fg', foot: 'Ver lista', onClick: () => { setEstado('suspendido'); setPage(1); } },
  ] : [];

  const selectCls = cn('min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink', focusRing);

  const columns: DataTableColumn<BiblioReader>[] = [
    {
      id: 'lector',
      header: 'Lector',
      cell: (r) => (
        <span className="flex items-center gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-brand/10 text-[12px] font-extrabold text-brand-text">{initials(r.firstName, r.lastName)}</span>
          <span className="min-w-0">
            <span className="block max-w-[220px] truncate text-[13.5px] font-bold leading-tight text-ink">{r.firstName} {r.lastName}</span>
            <span className="block font-mono text-[11px] text-faint tabular-nums">
              {r.code}{r.document ? ` · Céd. ${r.document}` : ''}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'tipo',
      header: 'Tipo',
      priority: 'md',
      cell: (r) => (
        r.readerType === 'empleado'
          ? <Chip tone="brand">Empleado{r.employeeCode ? ` · ${r.employeeCode}` : ''}</Chip>
          : <Chip tone="neutral">No empleado</Chip>
      ),
    },
    {
      id: 'contacto',
      header: 'Contacto',
      priority: 'lg',
      cell: (r) => (
        <span className="text-[12.5px] leading-snug text-muted">
          {r.email ? <span className="block max-w-[180px] truncate">{r.email}</span> : null}
          {r.phone ? <span className="block tabular-nums">{r.phone}</span> : null}
          {!r.email && !r.phone ? '—' : null}
        </span>
      ),
    },
    {
      id: 'estado',
      header: 'Estado',
      priority: 'md',
      cell: (r) => { const est = estadoDe(r); return <Chip tone={est.tone} dot>{est.label}</Chip>; },
    },
    {
      id: 'registro',
      header: 'Registro',
      priority: 'lg',
      cell: (r) => <span className="tabular-nums text-[13px] text-muted">{fmtDate(r.registeredAt)}</span>,
    },
    {
      id: 'acciones',
      header: '',
      align: 'right',
      width: 44,
      cell: (r) => (
        <button type="button" aria-label={`Ver detalles de ${r.firstName} ${r.lastName}`}
          onClick={(e) => { e.stopPropagation(); setSelected(r); }}
          className={cn('inline-grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-surface-container hover:text-ink', focusRing)}>
          <Eye size={15} strokeWidth={1.9} />
        </button>
      ),
    },
  ];

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-5">
      <div className="min-w-0">
        <div className="app-reveal">
          <SectionHeader
            level={1}
            title="Lectores"
            subtitle="El padrón del centro con su perfil bibliotecario — mismo carné QR, nunca se regenera."
            actions={
              <div className="flex items-center gap-2">
                <span className="hidden cursor-default items-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-[13px] font-bold text-faint sm:flex" title="Llega con el import por lotes">
                  <Upload size={15} strokeWidth={2} /> Importar <Chip tone="neutral">Pronto</Chip>
                </span>
                <Button ref={newLectorBtnRef} variant="primary" onClick={() => setDrawer(true)}><Plus size={16} strokeWidth={2.2} /> Nuevo lector</Button>
              </div>
            }
          />
        </div>

        {/* ── KPIs ── */}
        {stats ? (
          <div className="app-reveal mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ animationDelay: '40ms' }}>
            {kpis.map((k) => (
              <Card key={k.label} padding="md" className="flex items-center gap-3">
                <span className={cn('grid h-10 w-10 flex-none place-items-center rounded-xl', k.tint)}><k.Icon size={19} strokeWidth={1.9} /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-bold uppercase tracking-[0.04em] text-faint">{k.label}</span>
                  <span className="block text-[22px] font-extrabold leading-tight tabular-nums text-ink">{fmt(k.value)}</span>
                  {k.foot ? (
                    k.onClick ? (
                      <button type="button" onClick={k.onClick} className={cn('text-[11.5px] font-bold text-brand-text hover:underline', focusRing)}>{k.foot}</button>
                    ) : (
                      <span className="text-[11.5px] font-semibold text-faint">{k.foot}</span>
                    )
                  ) : null}
                </span>
              </Card>
            ))}
          </div>
        ) : null}

        {/* ── Búsqueda + filtros ── */}
        <Card padding="md" className="app-reveal mt-4" style={{ animationDelay: '70ms' }}>
          <label className={cn('flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5', focusRing)}>
            <Search size={16} className="text-faint" aria-hidden="true" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Buscar por nombre, cédula, correo, carné o código de empleado…" aria-label="Buscar lectores"
              className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint" />
            {loading ? <Loader2 size={15} className="animate-spin text-faint" /> : null}
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-faint">Tipo de lector</span>
              <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className={selectCls}>
                <option value="">Todos</option>
                <option value="empleado">Empleado</option>
                <option value="no_empleado">No empleado</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-faint">Estado</span>
              <select value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1); }} className={selectCls}>
                <option value="">Todos</option>
                <option value="activo">Activo</option>
                <option value="suspendido">Suspendido</option>
                <option value="archivado">Archivado (padrón)</option>
              </select>
            </label>
            <Button variant="secondary" onClick={limpiar} disabled={!hasFilters}>Limpiar filtros</Button>
          </div>
        </Card>

        {/* ── Resultados ── */}
        <p className="app-reveal mt-4 text-[14px] font-bold text-ink" aria-live="polite" style={{ animationDelay: '90ms' }}>
          {fmt(data.total)} {data.total === 1 ? 'lector encontrado' : 'lectores encontrados'}
        </p>
        <div className={cn('mt-2.5 transition-opacity', loading && 'opacity-50')}>
          <DataTableClient
            data={data.readers}
            columns={columns}
            getRowId={(r) => r.userId}
            ariaLabel="Lista de lectores"
            onRowClick={(r) => setSelected(r)}
            empty={
              <EmptyState icon={Users}
                title={data.total === 0 && !hasFilters ? 'Todavía no hay lectores' : 'Sin resultados'}
                description={data.total === 0 && !hasFilters
                  ? 'El padrón del centro aparece acá. También puedes dar de alta un lector nuevo.'
                  : 'Prueba con otra parte del nombre, la cédula, el correo o el carné.'}
                action={<Button variant="primary" onClick={() => setDrawer(true)}><Plus size={15} /> Nuevo lector</Button>} />
            }
            mobileCard={(r) => {
              const est = estadoDe(r);
              return (
                <div className="flex items-center gap-3 p-4">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-brand/10 text-[12px] font-extrabold text-brand-text">{initials(r.firstName, r.lastName)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-ink">{r.firstName} {r.lastName}</p>
                    <p className="truncate font-mono text-[10.5px] text-faint tabular-nums">{r.code}{r.document ? ` · Céd. ${r.document}` : ''}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Chip tone={est.tone} dot>{est.label}</Chip>
                      {r.readerType === 'empleado' ? <Chip tone="brand">Empleado</Chip> : null}
                    </div>
                  </div>
                  <button type="button" aria-label={`Ver detalles de ${r.firstName} ${r.lastName}`}
                    onClick={(e) => { e.stopPropagation(); setSelected(r); }}
                    className={cn('inline-grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-surface-container hover:text-ink', focusRing)}>
                    <Eye size={15} strokeWidth={1.9} />
                  </button>
                </div>
              );
            }}
          />

          {/* ── Paginación ── */}
          {data.total > 0 ? (
            <div className="mt-3.5 flex flex-wrap items-center gap-3 text-[12.5px] text-muted">
              <label className="flex items-center gap-1.5">
                Mostrando
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  aria-label="Lectores por página"
                  className={cn('min-h-8 rounded-lg border border-line bg-surface px-1.5 text-[12.5px] text-ink', focusRing)}>
                  {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                por página
              </label>
              {pages > 1 ? (
                <nav className="mx-auto flex items-center gap-1" aria-label="Paginación">
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
              <span className="ml-auto tabular-nums">{fmt(from)}–{fmt(to)} de {fmt(data.total)} lectores</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Panel de detalles: columna en xl, overlay en pantallas chicas ── */}
      <aside className="mt-5 hidden xl:mt-0 xl:block">
        {selected ? (
          <ReaderPanel reader={selected} onClose={() => setSelected(null)} onUpdated={applyUpdated} />
        ) : (
          <Card padding="lg" className="app-reveal text-center" style={{ animationDelay: '110ms' }}>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-container text-faint"><IdCard size={22} strokeWidth={1.7} /></span>
            <p className="mt-3 text-[13.5px] font-bold text-ink">Detalles del lector</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Selecciona una fila para ver el perfil, editar lo bibliotecario o suspender el servicio.</p>
          </Card>
        )}
      </aside>
      {selected ? (
        <div className="fixed inset-0 z-40 xl:hidden" role="dialog" aria-modal="true" aria-label="Detalles del lector">
          <button type="button" aria-label="Cerrar" onClick={() => setSelected(null)} className="absolute inset-0 bg-ink/40" />
          <div className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-page p-4 shadow-xl">
            <ReaderPanel reader={selected} onClose={() => setSelected(null)} onUpdated={applyUpdated} />
          </div>
        </div>
      ) : null}

      <NewReaderDrawer
        open={drawer}
        returnFocusRef={newLectorBtnRef}
        onClose={() => setDrawer(false)}
        onCreated={(reader) => {
          setDrawer(false);
          setData((d) => ({ ...d, readers: [reader, ...d.readers], total: d.total + 1 }));
          setSelected(reader);
          void refreshStats();
        }}
      />
    </div>
  );
}

// ── Panel de detalles + edición del perfil bibliotecario ─────────────────────
function ReaderPanel({ reader, onClose, onUpdated }: {
  reader: BiblioReader; onClose: () => void; onUpdated: (r: BiblioReader) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'informacion' | 'prestamos' | 'reservas'>('informacion');
  const [loans, setLoans] = useState<BiblioLoan[] | null>(null);
  const [reservations, setReservations] = useState<BiblioReservation[] | null>(null);
  const est = estadoDe(reader);

  const lastId = useRef(reader.userId);
  if (lastId.current !== reader.userId) {
    lastId.current = reader.userId;
    if (editing) setEditing(false);
    if (suspending) setSuspending(false);
    if (error) setError(null);
    setTab('informacion');
    setLoans(null);
    setReservations(null);
  }

  useEffect(() => {
    if (tab !== 'prestamos' || loans !== null) return;
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/app/biblioteca/api/readers/${reader.userId}/loans`, { cache: 'no-store', signal: ctl.signal });
        if (res.ok) setLoans(((await res.json()) as { loans: BiblioLoan[] }).loans);
        else setLoans([]);
      } catch { /* abort */ }
    })();
    return () => ctl.abort();
  }, [tab, loans, reader.userId]);

  useEffect(() => {
    if (tab !== 'reservas' || reservations !== null) return;
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/app/biblioteca/api/readers/${reader.userId}/reservations`, { cache: 'no-store', signal: ctl.signal });
        if (res.ok) setReservations(((await res.json()) as { reservations: BiblioReservation[] }).reservations);
        else setReservations([]);
      } catch { /* abort */ }
    })();
    return () => ctl.abort();
  }, [tab, reservations, reader.userId]);

  async function suspend(suspended: boolean, reason: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/app/biblioteca/api/readers/${reader.userId}/suspend`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ suspended, reason: reason.trim() || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.reader) { setError(j.error ?? 'No se pudo actualizar.'); return; }
      onUpdated(j.reader as BiblioReader);
      setSuspending(false);
    } catch { setError('Problema de red. Intenta de nuevo.'); }
    finally { setBusy(false); }
  }

  const row = (label: string, value: string | null, mono = false) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="flex-none text-[12.5px] text-muted">{label}</dt>
      <dd className={cn('min-w-0 truncate text-right text-[12.5px] font-semibold text-ink', mono && 'font-mono tabular-nums')}>{value ?? '—'}</dd>
    </div>
  );

  return (
    <Card padding="lg" className="app-reveal">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[14px] font-bold tracking-tight text-ink">Detalles del lector</h2>
        <IconButton label="Cerrar detalles" variant="outline" size="sm" onClick={onClose}><X size={15} /></IconButton>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-brand/10 text-[15px] font-extrabold text-brand-text">{initials(reader.firstName, reader.lastName)}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-extrabold leading-tight text-ink">{reader.firstName} {reader.lastName}</span>
            <Chip tone={est.tone} dot>{est.label}</Chip>
          </span>
          <span className="mt-0.5 flex items-center gap-1 font-mono text-[11.5px] text-faint tabular-nums"><QrCode size={12} aria-hidden="true" /> {reader.code}</span>
        </span>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}
        tabs={[
          { value: 'informacion', label: 'Información' },
          { value: 'prestamos', label: 'Préstamos' },
          { value: 'reservas', label: 'Reservas' },
        ]}
        className="mt-3.5 gap-2">

        <TabsContent value="prestamos">
          <ReaderLoans loans={loans} />
        </TabsContent>
        <TabsContent value="reservas">
          <ReaderReservations reservations={reservations} />
        </TabsContent>
        <TabsContent value="informacion">
          {editing ? (
            <ProfileEditForm reader={reader} busy={busy} setBusy={setBusy} setError={setError}
              onSaved={(r) => { onUpdated(r); setEditing(false); }} onCancel={() => setEditing(false)} />
          ) : (
            <>
              <h3 className="mt-4 text-[12px] font-bold uppercase tracking-[0.05em] text-faint">Datos personales</h3>
              <dl className="mt-1 divide-y divide-line/60">
                {row('Cédula', reader.document, true)}
                {row('Correo electrónico', reader.email)}
                {row('Teléfono', reader.phone, true)}
                {row('Visitas al centro', String(reader.visitCount), true)}
              </dl>

              <h3 className="mt-4 text-[12px] font-bold uppercase tracking-[0.05em] text-faint">Información del lector</h3>
              <dl className="mt-1 divide-y divide-line/60">
                {row('Tipo', reader.readerType === 'empleado' ? 'Empleado' : 'No empleado')}
                {reader.readerType === 'empleado' ? row('Código de empleado', reader.employeeCode, true) : null}
                {row('Fecha de registro', fmtDate(reader.registeredAt))}
                {row('Observaciones', reader.notes)}
                {reader.suspendedAt ? row('Suspendido desde', fmtDate(reader.suspendedAt)) : null}
                {reader.suspendedReason ? row('Motivo', reader.suspendedReason) : null}
              </dl>

              {error ? <p role="status" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] font-semibold text-danger-fg">{error}</p> : null}

              {suspending ? (
                <SuspendForm busy={busy} onConfirm={(reason) => suspend(true, reason)} onCancel={() => setSuspending(false)} />
              ) : (
                <div className="mt-4 flex flex-col gap-2">
                  <Button variant="secondary" className="w-full" onClick={() => { setError(null); setEditing(true); }}>
                    <Pencil size={14} strokeWidth={2} /> Editar perfil de lector
                  </Button>
                  {reader.suspendedAt ? (
                    <Button variant="secondary" className="w-full" disabled={busy} onClick={() => suspend(false, '')}>
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} strokeWidth={2} />} Reactivar servicio
                    </Button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => { setError(null); setSuspending(true); }}
                      className={cn('flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-danger-fg/30 px-3 text-[13px] font-bold text-danger-fg hover:bg-danger-bg', focusRing)}>
                      <UserX size={14} strokeWidth={2} /> Suspender servicio
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function ReaderLoans({ loans }: { loans: BiblioLoan[] | null }) {
  if (loans === null) {
    return <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted"><Loader2 size={14} className="animate-spin" /> Cargando préstamos…</p>;
  }
  if (loans.length === 0) {
    return <p className="mt-4 text-[12.5px] leading-relaxed text-muted">Sin préstamos registrados todavía. Se prestan desde Circulación con los dos escaneos.</p>;
  }
  const abiertos = loans.filter((l) => !l.returnedAt);
  const devueltos = loans.filter((l) => l.returnedAt);
  const Row = ({ l }: { l: BiblioLoan }) => (
    <li className="flex items-center gap-2.5 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold leading-tight text-ink">{l.title}</span>
        <span className="block font-mono text-[10.5px] text-faint tabular-nums">
          {l.inventoryCode} · {l.returnedAt ? `devuelto ${fmtDate(l.returnedAt)}` : `vence ${fmtDate(l.dueAt)}`}
        </span>
      </span>
      <LoanStatusChip loan={l} />
    </li>
  );
  return (
    <div className="mt-3">
      {abiertos.length > 0 ? (
        <>
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-faint">En curso ({abiertos.length})</h3>
          <ul className="divide-y divide-line/60">{abiertos.map((l) => <Row key={l.id} l={l} />)}</ul>
        </>
      ) : null}
      {devueltos.length > 0 ? (
        <>
          <h3 className="mt-3 text-[11.5px] font-bold uppercase tracking-[0.05em] text-faint">Devueltos</h3>
          <ul className="divide-y divide-line/60">{devueltos.slice(0, 10).map((l) => <Row key={l.id} l={l} />)}</ul>
        </>
      ) : null}
    </div>
  );
}

function ReaderReservations({ reservations }: { reservations: BiblioReservation[] | null }) {
  if (reservations === null) {
    return <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted"><Loader2 size={14} className="animate-spin" /> Cargando reservas…</p>;
  }
  if (reservations.length === 0) {
    return <p className="mt-4 text-[12.5px] leading-relaxed text-muted">Sin reservas registradas. Se crean desde la sección Reservas cuando una obra está toda prestada.</p>;
  }
  return (
    <ul className="mt-3 divide-y divide-line/60">
      {reservations.map((r) => (
        <li key={r.id} className="flex items-center gap-2.5 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-bold leading-tight text-ink">{r.title}</span>
            <span className="block font-mono text-[10.5px] text-faint tabular-nums">
              {r.code}{r.status === 'lista' && r.expiresAt ? ` · retirar antes del ${fmtDate(r.expiresAt)}` : ''}
            </span>
          </span>
          <ReservationStatusChip r={r} />
        </li>
      ))}
    </ul>
  );
}

function SuspendForm({ busy, onConfirm, onCancel }: { busy: boolean; onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className="mt-4 rounded-xl border border-danger-fg/25 bg-danger-bg/50 p-3">
      <p className="text-[12.5px] font-bold text-danger-fg">Suspender el servicio de biblioteca</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">No toca el padrón ni el carné — solo bloquea préstamos hasta reactivar.</p>
      <Field label="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. material sin devolver" className="mt-2" />
      <div className="mt-2.5 flex gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
        <button type="button" disabled={busy} onClick={() => onConfirm(reason)}
          className={cn('flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-danger-fg px-3 text-[12.5px] font-bold text-white disabled:opacity-50', focusRing)}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <UserX size={13} strokeWidth={2.2} />} Suspender
        </button>
      </div>
    </div>
  );
}

function ProfileEditForm({ reader, busy, setBusy, setError, onSaved, onCancel }: {
  reader: BiblioReader; busy: boolean; setBusy: (b: boolean) => void; setError: (e: string | null) => void;
  onSaved: (r: BiblioReader) => void; onCancel: () => void;
}) {
  const [readerType, setReaderType] = useState<BiblioReaderType>(reader.readerType);
  const [employeeCode, setEmployeeCode] = useState(reader.employeeCode ?? '');
  const [docNumber, setDocNumber] = useState(reader.document ?? '');
  const [notes, setNotes] = useState(reader.notes ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setLocalError(null); setError(null);
    try {
      const res = await fetch(`/app/biblioteca/api/readers/${reader.userId}/profile`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          readerType,
          employeeCode: employeeCode.trim() || null,
          document: docNumber.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.reader) { setLocalError(j.error ?? 'No se pudo guardar el perfil.'); return; }
      onSaved(j.reader as BiblioReader);
    } catch { setLocalError('Problema de red. Intenta de nuevo.'); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Tipo de lector</span>
        <div className="mt-1 flex gap-1.5">
          <Button type="button" variant="pill" size="sm" selected={readerType === 'no_empleado'} onClick={() => setReaderType('no_empleado')}>No empleado</Button>
          <Button type="button" variant="pill" size="sm" selected={readerType === 'empleado'} onClick={() => setReaderType('empleado')}>Empleado</Button>
        </div>
      </div>
      {readerType === 'empleado' ? (
        <Field label="Código de empleado (RRHH)" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} mono placeholder="EMP-0042" />
      ) : null}
      <Field label="Cédula / documento" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} mono placeholder="001-0000000-0" />
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Observaciones</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000}
          className={cn('mt-1 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-[13.5px] leading-relaxed text-ink', focusRing)} />
      </label>
      {localError ? <p role="status" className="rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] font-semibold text-danger-fg">{localError}</p> : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button type="submit" variant="primary" className="flex-1" disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.2} />} Guardar perfil
        </Button>
      </div>
    </form>
  );
}

// ── Alta al padrón (carné real) → Sheet del kit ──────────────────────────────
function NewReaderDrawer({ open, onClose, onCreated, returnFocusRef }: {
  open: boolean; onClose: () => void; onCreated: (r: BiblioReader) => void;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const [f, setF] = useState({ firstName: '', lastName: '', document: '', email: '', phone: '', employeeCode: '' });
  const [readerType, setReaderType] = useState<BiblioReaderType>('no_empleado');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setF({ firstName: '', lastName: '', document: '', email: '', phone: '', employeeCode: '' });
      setReaderType('no_empleado');
      setError(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/app/biblioteca/api/readers', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: f.firstName.trim(), lastName: f.lastName.trim(),
          email: f.email.trim() || null, phone: f.phone.trim() || null,
          document: f.document.trim() || null,
          readerType, employeeCode: readerType === 'empleado' ? (f.employeeCode.trim() || null) : null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.reader) { setError(j.error ?? 'No se pudo crear el lector.'); setBusy(false); return; }
      setBusy(false);
      onCreated(j.reader as BiblioReader);
    } catch { setError('Problema de red. Intenta de nuevo.'); setBusy(false); }
  }

  return (
    <Sheet
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title="Nuevo lector"
      dismissOnOverlay={false}
      returnFocusRef={returnFocusRef as React.RefObject<HTMLElement | null>}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="rounded-xl bg-surface-container/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted">
          Entra al <b className="text-ink">padrón del centro</b> con un carné QR real — el mismo que usa el kiosko y la puerta. Sin correo de credencial automático.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" required value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
          <Field label="Apellido" required value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        </div>
        <Field label="Cédula / documento (opcional)" value={f.document} onChange={(e) => setF({ ...f, document: e.target.value })} mono placeholder="001-0000000-0" />
        <Field label="Correo (opcional)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Field label="Teléfono (opcional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" />
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Tipo de lector</span>
          <div className="mt-1 flex gap-1.5">
            <Button type="button" variant="pill" size="sm" selected={readerType === 'no_empleado'} onClick={() => setReaderType('no_empleado')}>No empleado</Button>
            <Button type="button" variant="pill" size="sm" selected={readerType === 'empleado'} onClick={() => setReaderType('empleado')}>Empleado</Button>
          </div>
        </div>
        {readerType === 'empleado' ? (
          <Field label="Código de empleado (RRHH)" value={f.employeeCode} onChange={(e) => setF({ ...f, employeeCode: e.target.value })} mono placeholder="EMP-0042" />
        ) : null}

        {error ? <p role="status" className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger-fg">{error}</p> : null}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !f.firstName.trim() || !f.lastName.trim()}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={2.2} />} Crear lector
        </Button>
        <p className="text-center text-[12px] text-muted">El carné se genera al crear — quedará visible en sus detalles.</p>
      </form>
    </Sheet>
  );
}
