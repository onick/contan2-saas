'use client';

// components/biblioteca/CirculacionClient.tsx · CIRCULACIÓN (F2, el corazón)
// — modelo aprobado por el usuario (captura "Circulación"):
//   · tabs: Préstamos / Devoluciones / Renovaciones / Reservas (Pronto) / Historial
//   · búsqueda por lector (nombre/cédula/carné/correo) o ejemplar/título
//   · tabla: lector, ejemplar (portada + inv.), fechas, estado DERIVADO
//     (A tiempo / Vence pronto / Vencido / En sala), acciones devolver+renovar
//   · carril: acciones rápidas (préstamo/devolución/sala), resumen de HOY,
//     alertas (vencidos / vencen ≤3 días)
//   · Nuevo préstamo = flujo de 2 ESCANEOS (carné → ejemplar) con precheck
//     en vivo; Devolución = 1 escaneo del ejemplar.
// El "vencido" nunca es flag: lo deriva la API del ledger (mig 053).

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  ArrowLeftRight, RotateCcw, Bookmark, History, Search, Loader2, Check, X,
  ChevronLeft, ChevronRight, BookOpen, Armchair, AlertTriangle, Clock3, Eye,
  ScanBarcode, Plus, RefreshCw, QrCode,
} from 'lucide-react';
import type {
  BiblioLoansListResponse, BiblioLoan, BiblioCirculationSummary, BiblioLoanPrecheckResponse,
} from '@contan2/contracts';
import { Card, Button, IconButton, Chip, EmptyState, SectionHeader, cn, focusRing, useDrawerLifecycle } from '../ui';

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

export function LoanStatusChip({ loan }: { loan: BiblioLoan }) {
  switch (loan.status) {
    case 'devuelto': return <Chip tone="neutral">Devuelto</Chip>;
    case 'vencido': return <Chip tone="danger" dot>Vencido</Chip>;
    case 'vence_pronto': return <Chip tone="warning" dot>Vence pronto</Chip>;
    case 'en_sala': return <Chip tone="brand">En sala</Chip>;
    default: return <Chip tone="success" dot>A tiempo</Chip>;
  }
}

interface CircTab { key: string; label: string; Icon: typeof BookOpen; soon?: boolean }
const TABS: CircTab[] = [
  { key: 'activos', label: 'Préstamos', Icon: BookOpen },
  { key: 'devueltos', label: 'Devoluciones', Icon: RotateCcw },
  { key: 'renovados', label: 'Renovaciones', Icon: RefreshCw },
  { key: 'reservas', label: 'Reservas', Icon: Bookmark, soon: true },
  { key: 'todos', label: 'Historial', Icon: History },
];

export function CirculacionClient({ initial, initialSummary }: {
  initial: BiblioLoansListResponse; initialSummary: BiblioCirculationSummary | null;
}) {
  const [data, setData] = useState(initial);
  const [summary, setSummary] = useState(initialSummary);
  const [tab, setTab] = useState<string>('activos');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState<null | { mode: 'prestar'; kind: 'domicilio' | 'sala' } | { mode: 'devolver' }>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const first = useRef(true);
  const pageSize = 20;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ tab, page: String(page), pageSize: String(pageSize) });
      if (q.trim()) p.set('q', q.trim());
      const res = await fetch(`/app/biblioteca/api/loans?${p.toString()}`, { cache: 'no-store', signal });
      if (res.ok) setData(await res.json() as BiblioLoansListResponse);
      const s = await fetch('/app/biblioteca/api/loans/summary', { cache: 'no-store', signal });
      if (s.ok) setSummary(await s.json() as BiblioCirculationSummary);
    } catch { /* abort */ } finally { setLoading(false); }
  }, [tab, page, q]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const ctl = new AbortController();
    const t = setTimeout(() => { void refresh(ctl.signal); }, q ? 300 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [refresh, q]);

  async function renew(loan: BiblioLoan) {
    setBusyRow(loan.id); setRowError(null);
    try {
      const res = await fetch(`/app/biblioteca/api/loans/${loan.id}/renew`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.loan) { setRowError(j.error ?? 'No se pudo renovar.'); return; }
      setFlash(`Renovado: «${loan.title}» ahora vence el ${fmtDate((j.loan as BiblioLoan).dueAt)}.`);
      void refresh();
    } catch { setRowError('Problema de red. Reintentá.'); }
    finally { setBusyRow(null); }
  }

  async function devolver(loan: BiblioLoan) {
    setBusyRow(loan.id); setRowError(null);
    try {
      const res = await fetch('/app/biblioteca/api/returns', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inventoryCode: loan.inventoryCode }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.loan) { setRowError(j.error ?? 'No se pudo registrar la devolución.'); return; }
      setFlash(`Devuelto: «${loan.title}» (${loan.inventoryCode}).`);
      void refresh();
    } catch { setRowError('Problema de red. Reintentá.'); }
    finally { setBusyRow(null); }
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const showDue = tab !== 'devueltos';

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_290px] xl:items-start xl:gap-5">
      <div className="min-w-0">
        <div className="app-reveal">
          <SectionHeader
            level={1}
            title="Circulación"
            subtitle="Prestá y devolvé en dos escaneos: el carné del lector y el código del ejemplar."
            actions={
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setDrawer({ mode: 'devolver' })}><ScanBarcode size={15} strokeWidth={2} /> Devolución</Button>
                <Button variant="primary" onClick={() => setDrawer({ mode: 'prestar', kind: 'domicilio' })}><Plus size={16} strokeWidth={2.2} /> Nuevo préstamo</Button>
              </div>
            }
          />
        </div>

        {/* ── Tabs ── */}
        <div className="app-reveal mt-4 flex gap-1 overflow-x-auto border-b border-line" style={{ animationDelay: '30ms' }} role="tablist" aria-label="Vistas de circulación">
          {TABS.map((t) => t.soon ? (
            <Link key={t.key} href="/app/biblioteca/reservas"
              className={cn('flex flex-none items-center gap-1.5 px-3.5 py-2 text-[13.5px] font-medium text-muted hover:text-ink', focusRing)}>
              <t.Icon size={15} strokeWidth={1.9} /> {t.label}
            </Link>
          ) : (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              className={cn('flex flex-none items-center gap-1.5 px-3.5 py-2 text-[13.5px]', focusRing,
                tab === t.key ? 'border-b-2 border-brand font-bold text-brand' : 'font-medium text-muted hover:text-ink')}>
              <t.Icon size={15} strokeWidth={1.9} /> {t.label}
            </button>
          ))}
        </div>

        {/* ── Búsqueda ── */}
        <label className={cn('app-reveal mt-4 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5', focusRing)} style={{ animationDelay: '50ms' }}>
          <Search size={16} className="text-faint" aria-hidden="true" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Buscar por lector (nombre, cédula, carné, correo) o por ejemplar/título…" aria-label="Buscar préstamos"
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint" />
          {loading ? <Loader2 size={15} className="animate-spin text-faint" /> : null}
        </label>

        {flash ? <p role="status" className="mt-3 rounded-xl bg-success-bg px-4 py-2.5 text-[13px] font-semibold text-success-fg">✓ {flash}</p> : null}
        {rowError ? <p role="status" className="mt-3 rounded-xl bg-danger-bg px-4 py-2.5 text-[13px] font-semibold text-danger-fg">{rowError}</p> : null}

        {/* ── Tabla ── */}
        <p className="mt-4 text-[14px] font-bold text-ink" aria-live="polite">
          {fmt(data.total)} {data.total === 1 ? 'préstamo' : 'préstamos'}{tab === 'activos' ? ' activos' : tab === 'devueltos' ? ' devueltos' : tab === 'renovados' ? ' renovados' : tab === 'vencidos' ? ' vencidos' : ''}
        </p>
        <div className={cn('mt-2.5 transition-opacity', loading && 'opacity-50')}>
          {data.loans.length === 0 ? (
            <Card padding="lg">
              <EmptyState icon={ArrowLeftRight}
                title={q ? 'Sin resultados' : tab === 'activos' ? 'No hay préstamos activos' : 'Nada por acá todavía'}
                description={q ? 'Probá con otro nombre, carné o código de ejemplar.' : 'Registrá el primer préstamo con los dos escaneos: carné y ejemplar.'}
                action={<Button variant="primary" onClick={() => setDrawer({ mode: 'prestar', kind: 'domicilio' })}><Plus size={15} /> Nuevo préstamo</Button>} />
            </Card>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line bg-surface-container/60 text-[11px] font-bold uppercase tracking-[0.05em] text-faint">
                      <th className="px-4 py-2.5">Lector</th>
                      <th className="px-3 py-2.5">Ejemplar</th>
                      <th className="px-3 py-2.5">Préstamo</th>
                      <th className="px-3 py-2.5">{showDue ? 'Fecha límite' : 'Devolución'}</th>
                      <th className="px-3 py-2.5">Estado</th>
                      <th className="px-3 py-2.5"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {data.loans.map((l) => (
                      <tr key={l.id} className="transition-colors hover:bg-surface-container/40">
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-brand/10 text-[12px] font-extrabold text-brand">{initials(l.userFirstName, l.userLastName)}</span>
                            <span className="min-w-0">
                              <span className="block max-w-[170px] truncate text-[13px] font-bold leading-tight text-ink">{l.userFirstName} {l.userLastName}</span>
                              <span className="block font-mono text-[10.5px] text-faint tabular-nums">{l.userCode}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={`/app/biblioteca/titulos/${l.titleId}`} className={cn('flex items-center gap-2.5 rounded-lg', focusRing)}>
                            <span className="grid h-11 w-8 flex-none place-items-center overflow-hidden rounded border border-line/60 bg-[#1a6194]">
                              {l.coverUrl
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={l.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                                : <BookOpen size={13} className="text-white/85" aria-hidden="true" />}
                            </span>
                            <span className="min-w-0">
                              <span className="block max-w-[200px] truncate text-[13px] font-bold leading-tight text-ink hover:text-brand">{l.title}</span>
                              <span className="block max-w-[200px] truncate text-[11px] text-muted">{l.authors[0] ?? ''}</span>
                              <span className="block font-mono text-[10.5px] text-faint tabular-nums">Inv. {l.inventoryCode}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] tabular-nums text-muted">
                          {fmtDate(l.loanedAt)}
                          {l.kind === 'sala' ? <span className="block text-[10.5px] font-semibold text-faint">Consulta en sala</span> : null}
                          {l.renewals > 0 ? <span className="block text-[10.5px] text-faint">{l.renewals} renov.</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] tabular-nums text-muted">
                          {showDue ? fmtDate(l.dueAt) : (l.returnedAt ? fmtDate(l.returnedAt) : '—')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5"><LoanStatusChip loan={l} /></td>
                        <td className="px-3 py-2.5">
                          {l.returnedAt ? (
                            <Link href={`/app/biblioteca/titulos/${l.titleId}`} aria-label={`Ver ficha de ${l.title}`}
                              className={cn('inline-grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-surface-container hover:text-ink', focusRing)}>
                              <Eye size={15} strokeWidth={1.9} />
                            </Link>
                          ) : (
                            <span className="flex items-center justify-end gap-1">
                              <button type="button" disabled={busyRow === l.id} onClick={() => devolver(l)}
                                title="Registrar devolución" aria-label={`Devolver ${l.title}`}
                                className={cn('inline-grid h-8 w-8 place-items-center rounded-lg text-success-fg hover:bg-success-bg', focusRing)}>
                                {busyRow === l.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} strokeWidth={2.2} />}
                              </button>
                              {l.kind === 'domicilio' ? (
                                <button type="button" disabled={busyRow === l.id} onClick={() => renew(l)}
                                  title="Renovar (+14 días)" aria-label={`Renovar ${l.title}`}
                                  className={cn('inline-grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-surface-container hover:text-ink', focusRing)}>
                                  <RefreshCw size={14} strokeWidth={2} />
                                </button>
                              ) : null}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

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
                    p === data.page ? 'bg-brand text-white' : 'text-muted hover:bg-surface-container')}>
                  {p}
                </button>
              ))}
              <IconButton label="Página siguiente" variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={15} />
              </IconButton>
            </nav>
          ) : null}
        </div>
      </div>

      {/* ── Carril derecho ── */}
      <aside className="mt-5 xl:mt-0">
        <Card padding="md" className="app-reveal" style={{ animationDelay: '60ms' }}>
          <h2 className="text-[14px] font-bold tracking-tight text-ink">Acciones rápidas</h2>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <RailBtn Icon={BookOpen} label="Nuevo préstamo" onClick={() => setDrawer({ mode: 'prestar', kind: 'domicilio' })} />
            <RailBtn Icon={RotateCcw} label="Devolución" onClick={() => setDrawer({ mode: 'devolver' })} />
            <RailBtn Icon={Armchair} label="Consulta en sala" onClick={() => setDrawer({ mode: 'prestar', kind: 'sala' })} />
            <RailBtn Icon={Bookmark} label="Reserva" href="/app/biblioteca/reservas" />
          </div>
        </Card>

        {summary ? (
          <>
            <Card padding="md" className="app-reveal mt-4" style={{ animationDelay: '90ms' }}>
              <h2 className="text-[14px] font-bold tracking-tight text-ink">Resumen de hoy</h2>
              <dl className="mt-2 divide-y divide-line/60">
                <SummaryRow label="Préstamos realizados" value={summary.today.loans} />
                <SummaryRow label="Devoluciones" value={summary.today.returns} />
                <SummaryRow label="Renovaciones" value={summary.today.renewals} />
                <SummaryRow label="Préstamos abiertos" value={summary.alerts.activeTotal} />
              </dl>
            </Card>

            <Card padding="md" className="app-reveal mt-4" style={{ animationDelay: '120ms' }}>
              <h2 className="text-[14px] font-bold tracking-tight text-ink">Alertas</h2>
              <div className="mt-2 flex flex-col gap-1.5">
                <button type="button" onClick={() => { setTab('vencidos'); setPage(1); }}
                  className={cn('flex items-center gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-surface-container', focusRing)}>
                  <AlertTriangle size={15} className="flex-none text-danger-fg" aria-hidden="true" />
                  <span className="flex-1 text-[12.5px] font-semibold text-ink">Préstamos vencidos</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-extrabold tabular-nums', summary.alerts.overdue > 0 ? 'bg-danger-bg text-danger-fg' : 'bg-surface-container text-faint')}>{summary.alerts.overdue}</span>
                </button>
                <div className="flex items-center gap-2 rounded-xl px-2.5 py-2">
                  <Clock3 size={15} className="flex-none text-[#b45309]" aria-hidden="true" />
                  <span className="flex-1 text-[12.5px] font-semibold text-ink">Vencen en 3 días o menos</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-extrabold tabular-nums', summary.alerts.dueSoon > 0 ? 'bg-[#fdf3e7] text-[#b45309]' : 'bg-surface-container text-faint')}>{summary.alerts.dueSoon}</span>
                </div>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-faint">Política: {summary.policy.loanDays} días · máx. {summary.policy.maxRenewals} renovaciones · {summary.policy.maxOpenLoans} préstamos por lector.</p>
            </Card>
          </>
        ) : null}
      </aside>

      <CirculacionDrawer state={drawer} onClose={() => setDrawer(null)}
        onDone={(msg) => { setDrawer(null); setFlash(msg); void refresh(); }} />
    </div>
  );
}

function RailBtn({ Icon, label, onClick, href }: { Icon: typeof BookOpen; label: string; onClick?: () => void; href?: string }) {
  const cls = cn('flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-3 text-center transition-transform hover:-translate-y-0.5 hover:shadow-sm', focusRing);
  const inner = (
    <>
      <Icon size={18} strokeWidth={1.8} className="text-brand" />
      <span className="text-[11.5px] font-bold leading-tight text-ink">{label}</span>
    </>
  );
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="text-[15px] font-extrabold tabular-nums text-ink">{fmt(value)}</dd>
    </div>
  );
}

// ── Drawer de prestar (2 escaneos con precheck) / devolver (1 escaneo) ───────
function CirculacionDrawer({ state, onClose, onDone }: {
  state: null | { mode: 'prestar'; kind: 'domicilio' | 'sala' } | { mode: 'devolver' };
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const titleId = useId();
  const open = state !== null;
  const [readerCode, setReaderCode] = useState('');
  const [invCode, setInvCode] = useState('');
  const [kind, setKind] = useState<'domicilio' | 'sala'>('domicilio');
  const [pre, setPre] = useState<BiblioLoanPrecheckResponse>({ reader: null, item: null });
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invRef = useRef<HTMLInputElement>(null);

  const busyRef = useRef(busy); busyRef.current = busy;
  const reset = () => { setReaderCode(''); setInvCode(''); setPre({ reader: null, item: null }); setError(null); };
  const { mounted, closing, panelRef } = useDrawerLifecycle({ open, onEscape: () => { if (!busyRef.current) onClose(); }, onClosed: reset });

  // Al abrir en modo sala, preseleccionar el tipo.
  useEffect(() => { if (state?.mode === 'prestar') setKind(state.kind); }, [state]);

  // Precheck en vivo (debounce): valida carné y ejemplar mientras se escanea.
  useEffect(() => {
    if (!open || state?.mode !== 'prestar') return;
    if (!readerCode.trim() && !invCode.trim()) { setPre({ reader: null, item: null }); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const p = new URLSearchParams();
        if (readerCode.trim()) p.set('readerCode', readerCode.trim());
        if (invCode.trim()) p.set('inventoryCode', invCode.trim());
        const res = await fetch(`/app/biblioteca/api/loans/precheck?${p.toString()}`, { cache: 'no-store', signal: ctl.signal });
        if (res.ok) setPre(await res.json() as BiblioLoanPrecheckResponse);
      } catch { /* abort */ } finally { setChecking(false); }
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [open, state?.mode, readerCode, invCode]);

  if (!mounted || typeof document === 'undefined' || !state) return null;
  const prestar = state.mode === 'prestar';

  const readerOk = pre.reader && !pre.reader.suspended && !pre.reader.archived
    && (kind === 'sala' || pre.reader.openLoans < pre.reader.maxOpenLoans);
  const itemOk = pre.item && !pre.item.retired && !pre.item.onLoan && (kind === 'sala' || pre.item.loanable);
  const canConfirm = prestar ? (!!readerOk && !!itemOk && !busy) : (!!invCode.trim() && !busy);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!canConfirm) return;
    setBusy(true); setError(null);
    try {
      if (prestar) {
        const res = await fetch('/app/biblioteca/api/loans', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ readerCode: readerCode.trim(), inventoryCode: invCode.trim(), kind }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.loan) { setError(j.error ?? 'No se pudo registrar el préstamo.'); setBusy(false); return; }
        const loan = j.loan as BiblioLoan;
        setBusy(false);
        onDone(kind === 'sala'
          ? `En sala: «${loan.title}» para ${loan.userFirstName} ${loan.userLastName} — se devuelve hoy.`
          : `Prestado: «${loan.title}» a ${loan.userFirstName} ${loan.userLastName} — vence el ${fmtDate(loan.dueAt)}.`);
      } else {
        const res = await fetch('/app/biblioteca/api/returns', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ inventoryCode: invCode.trim() }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.loan) { setError(j.error ?? 'No se pudo registrar la devolución.'); setBusy(false); return; }
        const loan = j.loan as BiblioLoan;
        setBusy(false);
        onDone(`Devuelto: «${loan.title}» (${loan.inventoryCode}) de ${loan.userFirstName} ${loan.userLastName}.`);
      }
    } catch { setError('Problema de red. Reintentá.'); setBusy(false); }
  }

  return createPortal(
    <div tabIndex={-1} className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!busy) onClose(); }}
        className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')} />
      <div ref={panelRef} className={cn(
        'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t border-line bg-surface shadow-xl',
        'md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:h-auto md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0',
        'flex flex-col', closing && 'drawer-panel--closing')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Circulación</p>
            <h2 id={titleId} className="mt-1 text-lg font-bold leading-tight tracking-tight text-ink">
              {prestar ? (kind === 'sala' ? 'Consulta en sala' : 'Nuevo préstamo') : 'Devolución'}
            </h2>
          </div>
          <IconButton label="Cerrar" variant="outline" size="sm" onClick={onClose} disabled={busy}><X size={18} /></IconButton>
        </header>

        <form onSubmit={confirm} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          {prestar ? (
            <>
              <div className="flex gap-1.5">
                <Button type="button" variant="pill" size="sm" selected={kind === 'domicilio'} onClick={() => setKind('domicilio')}>A domicilio · 14 días</Button>
                <Button type="button" variant="pill" size="sm" selected={kind === 'sala'} onClick={() => setKind('sala')}>En sala · hoy</Button>
              </div>

              {/* Paso 1: carné */}
              <label className="mt-4 block">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint"><QrCode size={12} /> 1 · Carné del lector</span>
                <input value={readerCode} onChange={(e) => setReaderCode(e.target.value)} placeholder="Escaneá o escribí el código — CCB-…"
                  autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); invRef.current?.focus(); } }}
                  className={cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[14px] text-ink', focusRing)} />
              </label>
              {pre.reader ? (
                <div className={cn('mt-2 rounded-xl px-3.5 py-2.5 text-[12.5px] leading-snug',
                  pre.reader.suspended || pre.reader.archived || (kind === 'domicilio' && pre.reader.openLoans >= pre.reader.maxOpenLoans) ? 'bg-danger-bg text-danger-fg' : 'bg-success-bg text-success-fg')}>
                  <b>{pre.reader.firstName} {pre.reader.lastName}</b> · {pre.reader.readerType === 'empleado' ? 'Empleado' : 'No empleado'} · {pre.reader.openLoans}/{pre.reader.maxOpenLoans} préstamos
                  {pre.reader.suspended ? ' — servicio SUSPENDIDO' : pre.reader.archived ? ' — archivado en el padrón' : (kind === 'domicilio' && pre.reader.openLoans >= pre.reader.maxOpenLoans) ? ' — límite alcanzado' : ' ✓'}
                </div>
              ) : readerCode.trim() && !checking ? (
                <p className="mt-2 text-[12px] text-muted">Ese carné no aparece en el padrón.</p>
              ) : null}

              {/* Paso 2: ejemplar */}
              <label className="mt-4 block">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint"><ScanBarcode size={12} /> 2 · Código del ejemplar</span>
                <input ref={invRef} value={invCode} onChange={(e) => setInvCode(e.target.value)} placeholder="Escaneá o escribí el inventario — BIB-…"
                  className={cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[14px] text-ink', focusRing)} />
              </label>
              {pre.item ? (
                <div className={cn('mt-2 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[12.5px] leading-snug',
                  pre.item.retired || pre.item.onLoan || (kind === 'domicilio' && !pre.item.loanable) ? 'bg-danger-bg text-danger-fg' : 'bg-success-bg text-success-fg')}>
                  <span className="grid h-10 w-7 flex-none place-items-center overflow-hidden rounded border border-line/50 bg-[#1a6194]">
                    {pre.item.coverUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={pre.item.coverUrl} alt="" className="h-full w-full object-cover" />
                      : <BookOpen size={12} className="text-white/85" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate">{pre.item.title}</b>
                    {pre.item.onLoan ? 'Ya está prestado — devolvelo primero'
                      : pre.item.retired ? 'Dado de baja'
                      : (kind === 'domicilio' && !pre.item.loanable) ? 'Solo consulta en sala'
                      : `${pre.item.inventoryCode} ✓`}
                  </span>
                </div>
              ) : invCode.trim() && !checking ? (
                <p className="mt-2 text-[12px] text-muted">Ese código de ejemplar no existe.</p>
              ) : null}
            </>
          ) : (
            <label className="block">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint"><ScanBarcode size={12} /> Código del ejemplar</span>
              <input value={invCode} onChange={(e) => setInvCode(e.target.value)} placeholder="Escaneá o escribí el inventario — BIB-…" autoFocus
                className={cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[14px] text-ink', focusRing)} />
              <span className="mt-2 block text-[12px] leading-relaxed text-muted">Un solo escaneo: buscamos el préstamo abierto de ese ejemplar y lo cerramos.</span>
            </label>
          )}

          {error ? <p role="status" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger-fg">{error}</p> : null}

          <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" disabled={!canConfirm}>
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={2.2} />}
            {prestar ? (kind === 'sala' ? 'Registrar consulta' : 'Confirmar préstamo') : 'Registrar devolución'}
          </Button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
