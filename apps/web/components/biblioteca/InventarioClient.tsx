'use client';

// components/biblioteca/InventarioClient.tsx · INVENTARIO físico (F6)
// F8b: tabla → DataTableClient; tabs → Tabs del kit; drawer → Sheet.
// PROHIBIDO: no tocar lógica de escaneo (input, autofocus, Enter, scan()).

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ClipboardList, Search, Loader2, Check, X, ChevronLeft, ChevronRight,
  BookOpen, Plus, ScanBarcode, Download, Printer,
  CircleCheck, Eye, Inbox, ListChecks, ArrowUpRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  BiblioInventoriesListResponse, BiblioInventoryItemsResponse,
  BiblioInventoryItem, BiblioInventoryScanResponse, BiblioSite,
} from '@contan2/contracts';
import {
  Card, Button, IconButton, Chip, EmptyState, SectionHeader, Sheet,
  Tabs, TabsContent, DataTableClient, cn, focusRing,
} from '../ui';
import type { DataTableColumn } from '../ui';
import { BibliotecaHeader } from './BibliotecaHeader';

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

const ESTADO_META: Record<BiblioInventoryItem['estado'], { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'brand' }> = {
  disponible: { label: 'Disponible', tone: 'success' },
  prestado: { label: 'Prestado', tone: 'warning' },
  reservado: { label: 'Reservado', tone: 'brand' },
  reparacion: { label: 'En reparación', tone: 'neutral' },
  deteriorado: { label: 'Deteriorado', tone: 'neutral' },
  extraviado: { label: 'Extraviado', tone: 'danger' },
  baja: { label: 'Baja', tone: 'neutral' },
};

function ResultChip({ r }: { r: BiblioInventoryItem['resultado'] }) {
  switch (r) {
    case 'encontrado': return <Chip tone="success" dot>✓ Encontrado</Chip>;
    case 'fuera_ubicacion': return <Chip tone="warning" dot>Fuera de ubicación</Chip>;
    case 'prestado': return <Chip tone="brand">Prestado</Chip>;
    case 'faltante': return <Chip tone="danger" dot>Faltante</Chip>;
    default: return <Chip tone="neutral">Pendiente</Chip>;
  }
}

export function InventarioClient({ initial, sites }: {
  initial: BiblioInventoriesListResponse; sites: BiblioSite[];
}) {
  const [sessions, setSessions] = useState(initial);
  const [tab, setTab] = useState<string>('todos');
  const [items, setItems] = useState<BiblioInventoryItemsResponse | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [busyFinish, setBusyFinish] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanCode, setScanCode] = useState('');
  const pageSize = 20;
  const nuevoInventarioBtnRef = useRef<HTMLButtonElement>(null);

  const active = sessions.active;
  const viewing = active ?? sessions.previous[0] ?? null;

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/app/biblioteca/api/inventories', { cache: 'no-store' });
      if (res.ok) setSessions(await res.json() as BiblioInventoriesListResponse);
    } catch { /* red */ }
  }, []);

  const refreshItems = useCallback(async (signal?: AbortSignal) => {
    if (tab === 'anteriores') { setItems(null); return; }
    setLoading(true);
    try {
      let url: string;
      if (tab === 'bajas') {
        const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (q.trim()) p.set('q', q.trim());
        url = `/app/biblioteca/api/retired-items?${p.toString()}`;
      } else {
        if (!viewing) { setItems(null); setLoading(false); return; }
        const p = new URLSearchParams({ tab, page: String(page), pageSize: String(pageSize) });
        if (q.trim()) p.set('q', q.trim());
        url = `/app/biblioteca/api/inventories/${viewing.id}/items?${p.toString()}`;
      }
      const res = await fetch(url, { cache: 'no-store', signal });
      if (res.ok) setItems(await res.json() as BiblioInventoryItemsResponse);
    } catch { /* abort */ } finally { setLoading(false); }
  }, [tab, page, q, viewing?.id]);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => { void refreshItems(ctl.signal); }, q ? 300 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [refreshItems, q]);

  // ── Escaneo: NO TOCAR esta lógica ──
  async function scan(code: string) {
    if (!active || !code.trim() || scanning) return;
    setScanning(true);
    try {
      const res = await fetch(`/app/biblioteca/api/inventories/${active.id}/scan`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inventoryCode: code.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setScanMsg({ kind: 'err', text: j.error ?? 'No se pudo escanear.' });
      } else {
        const s = j as BiblioInventoryScanResponse;
        const map = {
          encontrado: { kind: 'ok' as const, text: `✓ ${s.item.inventoryCode} · «${s.item.title}» — encontrado (${s.scanned}/${s.expected})` },
          fuera_ubicacion: { kind: 'warn' as const, text: `${s.item.inventoryCode} · «${s.item.title}» — FUERA DE UBICACIÓN (registrado en ${s.item.siteName ?? 'otro sitio'})` },
          prestado: { kind: 'warn' as const, text: `${s.item.inventoryCode} · «${s.item.title}» — figura PRESTADO y apareció en el estante` },
          ya_escaneado: { kind: 'warn' as const, text: `${s.item.inventoryCode} — ya estaba escaneado en esta sesión` },
        };
        setScanMsg(map[s.result]);
        void refreshSessions();
        void refreshItems();
      }
    } catch { setScanMsg({ kind: 'err', text: 'Problema de red. Intenta de nuevo.' }); }
    finally {
      setScanning(false);
      setScanCode('');
      scanRef.current?.focus();
    }
  }

  async function finish() {
    if (!active || busyFinish) return;
    setBusyFinish(true);
    try {
      const res = await fetch(`/app/biblioteca/api/inventories/${active.id}/finish`, { method: 'POST' });
      if (res.ok) {
        setFinishing(false);
        setScanMsg(null);
        await refreshSessions();
        void refreshItems();
      }
    } catch { /* red */ } finally { setBusyFinish(false); }
  }

  const pct = viewing && viewing.expected > 0 ? Math.round((viewing.scanned / viewing.expected) * 100) : 0;
  const pages = items ? Math.max(1, Math.ceil(items.total / items.pageSize)) : 1;

  const TABS_ITEMS = [
    { value: 'todos', label: 'Ejemplares' },
    { value: 'faltantes', label: viewing?.status === 'finalizado' ? 'Faltantes' : 'Pendientes' },
    { value: 'fuera', label: 'Fuera de ubicación' },
    { value: 'prestados', label: 'Prestados' },
    { value: 'anteriores', label: 'Anteriores' },
    { value: 'bajas', label: 'Bajas' },
  ];

  const itemColumns: DataTableColumn<BiblioInventoryItem>[] = [
    {
      id: 'codigo',
      header: 'Código de barras',
      cell: (it) => <span className="font-mono text-[12.5px] font-bold tabular-nums text-ink">{it.inventoryCode}</span>,
    },
    {
      id: 'titulo',
      header: 'Título / Autor',
      cell: (it) => (
        <Link href={`/app/biblioteca/titulos/${it.titleId}`} className={cn('flex items-center gap-2.5 rounded-lg', focusRing)}>
          <span className="grid h-11 w-8 flex-none place-items-center overflow-hidden rounded border border-line/60 bg-brand-accent">
            {it.coverUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={it.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              : <BookOpen size={13} className="text-white/85" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block max-w-[200px] truncate text-[13px] font-bold leading-tight text-ink hover:text-brand-text">{it.title}</span>
            <span className="block max-w-[200px] truncate text-[11px] text-muted">{it.authors[0] ?? ''}</span>
          </span>
        </Link>
      ),
    },
    {
      id: 'signatura',
      header: 'Signatura',
      priority: 'lg',
      cell: (it) => <span className="font-mono text-[12px] tabular-nums text-muted">{it.callNumber ?? '—'}</span>,
    },
    {
      id: 'ubicacion',
      header: 'Ubicación',
      priority: 'md',
      cell: (it) => (
        <span className="text-[12px] text-muted">
          {it.siteName ? <>{it.siteName}{it.shelf ? <span className="block text-[11px] text-faint">{it.shelf}</span> : null}</> : '—'}
          {it.foundSiteName && it.resultado === 'fuera_ubicacion' ? (
            <span className="block text-[10.5px] font-bold text-warning-fg">apareció en {it.foundSiteName}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'estado_resultado',
      header: tab === 'bajas' ? 'Motivo de baja' : 'Estado',
      priority: 'md',
      cell: (it) => (
        tab === 'bajas'
          ? <span className="text-[12px] text-muted">{it.retiredReason ?? '—'}</span>
          : <Chip tone={ESTADO_META[it.estado].tone} dot>{ESTADO_META[it.estado].label}</Chip>
      ),
    },
    {
      id: 'resultado',
      header: tab === 'bajas' ? 'Fecha' : 'Resultado',
      priority: 'md',
      cell: (it) => (
        tab === 'bajas'
          ? <span className="text-[12px] tabular-nums text-muted">{it.scannedAt ? fmtDate(it.scannedAt) : '—'}</span>
          : <ResultChip r={it.resultado} />
      ),
    },
    {
      id: 'acciones',
      header: '',
      align: 'right',
      width: 44,
      cell: (it) => (
        <Link href={`/app/biblioteca/titulos/${it.titleId}`} aria-label={`Ver ficha de ${it.title}`}
          className={cn('inline-grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-surface-container hover:text-ink', focusRing)}>
          <Eye size={15} strokeWidth={1.9} />
        </Link>
      ),
    },
  ];

  const estadoFaltantes = viewing?.status === 'finalizado' ? 'Faltantes' : 'Pendientes';
  const tieneResultados = !!viewing && viewing.scanned + viewing.missing + viewing.onLoan > 0;

  return (
    <div>
      <BibliotecaHeader as="p" />

      <div className="app-reveal mt-6">
        <SectionHeader
          level={1}
          title="Inventario"
          subtitle="Controla y verifica los ejemplares físicos: escanea uno a uno y el resultado se registra solo."
          actions={!active ? <Button ref={nuevoInventarioBtnRef} variant="primary" onClick={() => setDrawer(true)}><Plus size={16} strokeWidth={2.2} /> Nuevo inventario</Button> : undefined}
        />
      </div>

      <div className="mt-5 flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── Inventario seleccionado (tarjeta oscura) ── */}
          {viewing ? (
            <section
              data-testid="inventario-seleccionado"
              className="app-reveal rounded-card bg-accent-strong p-6 text-accent-strong-fg md:p-8"
              style={{ animationDelay: '40ms' }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-accent-strong-fg/80">
                  <ClipboardList size={16} strokeWidth={1.8} aria-hidden="true" /> Inventario seleccionado
                </p>
                <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12.5px] font-semibold text-white">
                  <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', viewing.status === 'en_progreso' ? 'bg-brand' : 'bg-white/60')} />
                  {viewing.status === 'en_progreso' ? 'En progreso' : 'Finalizado'}
                </span>
              </div>

              <h2 className="mt-4 text-[26px] font-bold leading-tight tracking-tight md:text-[28px]">{viewing.name}</h2>
              <p className="mt-2 text-[13.5px] text-accent-strong-fg/80">
                {viewing.startedByName ? <>Iniciado por: {viewing.startedByName} · </> : null}{fmtDate(viewing.startedAt)}
              </p>
              <p className="mt-0.5 text-[13.5px] text-accent-strong-fg/80">Alcance: {viewing.siteName ?? 'Todo el acervo'}</p>

              <div className="mt-7">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-accent-strong-fg/70">Progreso</p>
                    <p className="mt-1 text-[16px] font-semibold tabular-nums">Escaneados: {fmt(viewing.scanned)} / {fmt(viewing.expected)}</p>
                  </div>
                  <p className="num text-[48px] font-medium leading-none tracking-tight tabular-nums md:text-[56px]">{pct}%</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
                </div>
              </div>

              {finishing && active ? (
                <p className="mt-5 rounded-xl bg-white/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-white">
                  Al cerrar, los {fmt(active.missing)} sin escanear (y sin préstamo) quedan como <b>FALTANTES</b> en el resumen. Puedes seguir escaneando si todavía falta recorrer estantes.
                </p>
              ) : null}

              {active ? (
                <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                  {finishing ? (
                    <>
                      <button type="button" onClick={() => setFinishing(false)} disabled={busyFinish}
                        className={cn(darkBtn, 'border border-white/20 bg-white/10 text-white hover:bg-white/20')}>
                        Seguir escaneando
                      </button>
                      <button type="button" onClick={finish} disabled={busyFinish}
                        className={cn(darkBtn, 'bg-brand text-brand-fg hover:opacity-90')}>
                        {busyFinish ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.2} />} Confirmar cierre
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setFinishing(true)}
                      className={cn(darkBtn, 'border border-white/20 bg-white/10 text-white hover:bg-white/20')}>
                      Finalizar inventario
                    </button>
                  )}
                </div>
              ) : null}
            </section>
          ) : (
            <Card padding="lg" className="app-reveal" style={{ animationDelay: '40ms' }}>
              <EmptyState icon={ClipboardList}
                title="Sin inventarios todavía"
                description="Abre una sesión (todo el acervo o un sitio) y escanea los ejemplares uno a uno — el resultado se registra solo."
                action={<Button variant="primary" onClick={() => setDrawer(true)}><Plus size={15} /> Nuevo inventario</Button>} />
            </Card>
          )}

          {/* ── Escaneo (solo con inventario activo) — lógica INTOCABLE ── */}
          {active ? (
            <Card padding="lg" className="app-reveal" style={{ animationDelay: '55ms' }}>
              <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-ink">
                <ScanBarcode size={19} strokeWidth={1.8} className="text-brand-text" aria-hidden="true" /> Escanear ejemplar
              </h2>
              <form className="mt-3.5" onSubmit={(e) => { e.preventDefault(); void scan(scanCode); }}>
                <label className={cn('flex min-h-11 items-center gap-2.5 rounded-xl border-2 border-brand/40 bg-surface px-3.5', focusRing)}>
                  <ScanBarcode size={18} className="flex-none text-brand-text" aria-hidden="true" />
                  <input ref={scanRef} value={scanCode} onChange={(e) => setScanCode(e.target.value)} autoFocus
                    placeholder="Escanea el código de barras del ejemplar (o escríbelo y Enter)…" aria-label="Escanear ejemplar"
                    className="min-h-11 w-full bg-transparent font-mono text-[15px] text-ink outline-none placeholder:font-sans placeholder:text-faint" />
                  {scanning ? <Loader2 size={16} className="animate-spin text-faint" /> : null}
                </label>
              </form>
              {scanMsg ? (
                <p role="status" className={cn('mt-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold',
                  scanMsg.kind === 'ok' ? 'bg-success-bg text-success-fg' : scanMsg.kind === 'warn' ? 'bg-warning-bg text-warning-fg' : 'bg-danger-bg text-danger-fg')}>
                  {scanMsg.text}
                </p>
              ) : null}
            </Card>
          ) : null}

          {/* ── Consulta de ejemplares ── */}
          <Card padding="lg" className="app-reveal" style={{ animationDelay: '70ms' }}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-bold tracking-tight text-ink">Consulta de ejemplares</h2>
              <BookOpen size={20} strokeWidth={1.5} aria-hidden="true" className="flex-none text-faint" />
            </div>
            <Tabs
              className="mt-4"
              value={tab}
              onValueChange={(v) => { setTab(v); setPage(1); }}
              tabs={TABS_ITEMS}
            >
              <TabsContent value={tab} className="flex flex-col gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
              {tab === 'anteriores' ? (
                <div>
                  {sessions.previous.length === 0 ? (
                    <p className="py-6 text-center text-[13.5px] text-muted">Todavía no hay inventarios finalizados.</p>
                  ) : (
                    <ul className="divide-y divide-line/70 rounded-xl border border-line/70">
                      {sessions.previous.map((v) => (
                        <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-bold text-ink">{v.name}</span>
                            <span className="block text-[11.5px] text-faint">{fmtDate(v.startedAt)}{v.finishedAt ? ` → ${fmtDate(v.finishedAt)}` : ''} · {v.siteName ?? 'Todo el acervo'}{v.startedByName ? ` · ${v.startedByName}` : ''}</span>
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                            <Chip tone="success">✓ {fmt(v.found)}</Chip>
                            {v.misplaced > 0 ? <Chip tone="warning">{fmt(v.misplaced)} fuera</Chip> : null}
                            {v.onLoan > 0 ? <Chip tone="brand">{fmt(v.onLoan)} prestados</Chip> : null}
                            <Chip tone={v.missing > 0 ? 'danger' : 'neutral'}>{fmt(v.missing)} faltantes</Chip>
                          </span>
                          <a href={`/app/biblioteca/api/inventories/${v.id}/export`} download
                            className={cn('flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] font-bold text-muted hover:bg-surface-container hover:text-ink', focusRing)}>
                            <Download size={13} strokeWidth={2} /> Excel
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <>
                  <label className={cn('flex min-h-11 items-center gap-2.5 rounded-xl bg-surface-container px-3.5 py-2.5', focusRing)}>
                    <Search size={16} className="text-faint" aria-hidden="true" />
                    <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
                      placeholder="Buscar por título, autor, ISBN, código de barras o signatura…" aria-label="Buscar ejemplares"
                      className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint" />
                    {loading ? <Loader2 size={15} className="animate-spin text-faint" /> : null}
                  </label>

                  <div className={cn('transition-opacity', loading && 'opacity-50')}>
                    {!items || items.items.length === 0 ? (
                      <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
                        <span className="grid h-16 w-16 place-items-center rounded-full bg-info-soft text-info-text">
                          <Inbox size={28} strokeWidth={1.5} aria-hidden="true" />
                        </span>
                        <p className="text-[17px] font-semibold tracking-tight text-ink">
                          {tab === 'bajas' ? 'No hay ejemplares dados de baja.' : !viewing ? 'Abre un inventario para ver los ejemplares.' : q ? 'Sin resultados con esa búsqueda.' : 'Nada en esta vista.'}
                        </p>
                      </div>
                    ) : (
                      <DataTableClient
                        data={items.items}
                        columns={itemColumns}
                        getRowId={(it) => it.itemId}
                        ariaLabel="Ejemplares del inventario"
                        mobileCard={(it) => (
                          <div className="flex items-center gap-3 p-4">
                            <span className="grid h-11 w-8 flex-none place-items-center overflow-hidden rounded border border-line/60 bg-brand-accent">
                              {it.coverUrl
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={it.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                                : <BookOpen size={13} className="text-white/85" aria-hidden="true" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-bold text-ink">{it.title}</p>
                              <p className="font-mono text-[10.5px] text-faint tabular-nums">{it.inventoryCode}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {tab !== 'bajas' ? <Chip tone={ESTADO_META[it.estado].tone} dot>{ESTADO_META[it.estado].label}</Chip> : null}
                                <ResultChip r={it.resultado} />
                              </div>
                            </div>
                            <Link href={`/app/biblioteca/titulos/${it.titleId}`} aria-label={`Ver ficha de ${it.title}`}
                              className={cn('inline-grid h-8 w-8 flex-none place-items-center rounded-lg text-faint hover:bg-surface-container hover:text-ink', focusRing)}>
                              <Eye size={15} strokeWidth={1.9} />
                            </Link>
                          </div>
                        )}
                      />
                    )}

                    {items && pages > 1 ? (
                      <nav className="mt-3.5 flex items-center justify-center gap-1" aria-label="Paginación">
                        <IconButton label="Página anterior" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                          <ChevronLeft size={15} />
                        </IconButton>
                        {pageWindow(items.page, pages).map((p, i) => p === '…' ? (
                          <span key={`e${i}`} className="px-1 text-faint">…</span>
                        ) : (
                          <button key={p} type="button" onClick={() => setPage(p)} aria-current={p === items.page ? 'page' : undefined}
                            className={cn('grid h-8 min-w-8 place-items-center rounded-lg px-1 text-[12.5px] font-bold tabular-nums', focusRing,
                              p === items.page ? 'bg-brand text-brand-fg' : 'text-muted hover:bg-surface-container')}>
                            {p}
                          </button>
                        ))}
                        <IconButton label="Página siguiente" variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                          <ChevronRight size={15} />
                        </IconButton>
                      </nav>
                    ) : null}
                  </div>
                </>
              )}
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* ── Carril derecho ── */}
        <aside className="flex flex-col gap-4">
          {viewing ? (
            <>
              <Card padding="lg" className="app-reveal" style={{ animationDelay: '60ms' }}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[17px] font-bold tracking-tight text-ink">Resumen del inventario</h2>
                  <ListChecks size={20} strokeWidth={1.5} aria-hidden="true" className="flex-none text-faint" />
                </div>
                <dl className="mt-3 divide-y divide-line/60">
                  <SummaryRow label="Total de ejemplares" value={viewing.expected} tone="text-ink" />
                  <SummaryRow label="Escaneados" value={viewing.scanned} tone="text-ink" />
                  <SummaryRow label="Encontrados" value={viewing.found} tone="text-success-fg" />
                  <SummaryRow label="Fuera de ubicación" value={viewing.misplaced} tone={viewing.misplaced > 0 ? 'text-warning-fg' : 'text-ink'} />
                  <SummaryRow label="Prestados (en la calle)" value={viewing.onLoan} tone="text-info-text" />
                  <SummaryRow label={viewing.status === 'finalizado' ? 'Faltantes' : 'Pendientes por escanear'} value={viewing.missing} tone={viewing.status === 'finalizado' && viewing.missing > 0 ? 'text-danger-fg' : 'text-ink'} />
                </dl>
                <div className="mt-2.5 flex items-baseline justify-between border-t border-line/60 pt-3">
                  <span className="text-[13px] font-bold text-ink">Completado</span>
                  <span className="text-[17px] font-extrabold tabular-nums text-brand-text">{pct}%</span>
                </div>
              </Card>

              {tieneResultados ? (
                <Card padding="lg" className="app-reveal" style={{ animationDelay: '90ms' }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-[17px] font-bold tracking-tight text-ink">Resultados</h2>
                    <span className="text-[14px] font-bold tabular-nums text-brand-text">{pct}%</span>
                  </div>
                  <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
                    <ResultStat dot="bg-success-fg" value={viewing.found} label="Encontrados" />
                    <ResultStat dot="bg-warning-fg" value={viewing.misplaced} label="Fuera de ubicación" />
                    <ResultStat dot="bg-info-text" value={viewing.onLoan} label="Prestados" />
                    <ResultStat dot="bg-danger-fg" value={viewing.missing} label={estadoFaltantes} />
                  </ul>
                </Card>
              ) : null}

              <Card padding="lg" className="app-reveal" style={{ animationDelay: '120ms' }}>
                <h2 className="text-[17px] font-bold tracking-tight text-ink">Herramientas</h2>
                <div className="mt-3 flex flex-col gap-1">
                  <a href={`/app/biblioteca/api/inventories/${viewing.id}/export`} download
                    className={cn(toolRow, 'text-ink hover:bg-surface-container', focusRing)}>
                    <ToolChip icon={Download} /> <span className="min-w-0 flex-1">Exportar resultados (Excel)</span>
                    <ArrowUpRight size={15} strokeWidth={1.8} aria-hidden="true" className="flex-none text-faint" />
                  </a>
                  <button type="button" onClick={() => { setTab('faltantes'); setPage(1); }}
                    className={cn(toolRow, 'w-full text-left text-ink hover:bg-surface-container', focusRing)}>
                    <ToolChip icon={Search} /> <span className="min-w-0 flex-1">Ver {viewing.status === 'finalizado' ? 'faltantes' : 'pendientes'}</span>
                    <ArrowUpRight size={15} strokeWidth={1.8} aria-hidden="true" className="flex-none text-faint" />
                  </button>
                  <span className={cn(toolRow, 'cursor-default text-faint')} title="Llega en una fase posterior">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface-container text-faint"><Printer size={17} strokeWidth={1.8} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">Imprimir etiquetas de códigos</span>
                    <Chip tone="neutral">Pronto</Chip>
                  </span>
                </div>
              </Card>
            </>
          ) : null}

          <section className="app-reveal rounded-card bg-surface-container p-5" style={{ animationDelay: '150ms' }}>
            <h2 className="flex items-center gap-1.5 text-[13.5px] font-bold tracking-tight text-ink"><CircleCheck size={14} className="text-brand-text" /> Consejo</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              Escanea los códigos de los ejemplares uno por uno para verificar su existencia y ubicación.
              Lo que figura prestado no cuenta como faltante: está en la calle, no perdido.
            </p>
          </section>
        </aside>
      </div>

      <NewInventoryDrawer
        open={drawer}
        sites={sites}
        returnFocusRef={nuevoInventarioBtnRef}
        onClose={() => setDrawer(false)}
        onCreated={() => { setDrawer(false); void refreshSessions(); setTab('todos'); setPage(1); }}
      />
    </div>
  );
}

const darkBtn = cn('inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-[13.5px] font-bold transition-colors disabled:opacity-50', focusRing);
const toolRow = 'flex items-center gap-3 rounded-xl px-2 py-2 text-[13.5px] font-semibold';

function ToolChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-brand-soft text-brand-text">
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
    </span>
  );
}

function ResultStat({ dot, value, label }: { dot: string; value: number; label: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span aria-hidden="true" className={cn('h-2 w-2 flex-none rounded-full', dot)} />
      <span className="num text-[28px] font-medium leading-none tabular-nums text-ink">{fmt(value)}</span>
      <span className="min-w-0 text-[12px] leading-tight text-muted">{label}</span>
    </li>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className={cn('text-[14.5px] font-extrabold tabular-nums', tone)}>{fmt(value)}</dd>
    </div>
  );
}

// ── Nuevo inventario → Sheet del kit ─────────────────────────────────────────
function NewInventoryDrawer({ open, sites, onClose, onCreated, returnFocusRef }: {
  open: boolean; sites: BiblioSite[]; onClose: () => void; onCreated: () => void;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const [name, setName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setName(''); setSiteId(''); setError(null); }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/app/biblioteca/api/inventories', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), siteId: siteId || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.inventory) { setError(j.error ?? 'No se pudo abrir el inventario.'); setBusy(false); return; }
      setBusy(false);
      onCreated();
    } catch { setError('Problema de red. Intenta de nuevo.'); setBusy(false); }
  }

  return (
    <Sheet
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title="Nuevo inventario"
      dismissOnOverlay={false}
      returnFocusRef={returnFocusRef as React.RefObject<HTMLElement | null>}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus
            placeholder="Ej. Inventario anual 2026 — Sala General"
            className={cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink', focusRing)} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Alcance</span>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}
            className={cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink', focusRing)}>
            <option value="">Todo el acervo</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="mt-1.5 block text-[12px] leading-relaxed text-muted">
            Con un sitio elegido, un ejemplar de OTRO sitio que aparezca acá se marca «fuera de ubicación».
          </span>
        </label>

        {error ? <p role="status" className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger-fg">{error}</p> : null}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !name.trim()}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={2.2} />} Abrir inventario
        </Button>
        <p className="text-center text-[12px] text-muted">Solo puede haber un inventario en progreso a la vez.</p>
      </form>
    </Sheet>
  );
}
