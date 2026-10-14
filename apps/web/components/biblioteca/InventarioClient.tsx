'use client';

// components/biblioteca/InventarioClient.tsx · INVENTARIO físico (F6) — modelo
// aprobado por el usuario (captura "Inventario"):
//   · sesión activa: tarjeta con progreso (escaneados/esperados) + Finalizar
//   · CAJA DE ESCANEO grande (autofocus): cada código responde al instante
//     (Encontrado ✓ / Fuera de ubicación / Prestado / Ya escaneado / no existe)
//   · tabs: Ejemplares / Faltantes / Fuera de ubicación / Prestados /
//     Anteriores / Bajas — resultado SIEMPRE derivado
//   · carril: resumen con % + donut CSS de resultados + herramientas
//     (exportar Excel real; etiquetas "Pronto")
//   · Nuevo inventario: nombre + alcance (todo el acervo o un sitio)
// Un inventario en progreso por organización (lo garantiza la DB).

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  ClipboardList, History, Search, Loader2, Check, X, ChevronLeft, ChevronRight,
  BookOpen, Plus, ScanBarcode, Download, Printer, MapPin, Trash2, AlertTriangle,
  CircleCheck, Eye,
} from 'lucide-react';
import type {
  BiblioInventoriesListResponse, BiblioInventory, BiblioInventoryItemsResponse,
  BiblioInventoryItem, BiblioInventoryScanResponse, BiblioSite,
} from '@contan2/contracts';
import { Card, Button, IconButton, Chip, EmptyState, SectionHeader, cn, focusRing, useDrawerLifecycle } from '../ui';

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
  const [tab, setTab] = useState<string>('todos'); // todos|faltantes|fuera|prestados|anteriores|bajas
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

  const active = sessions.active;
  // La sesión que alimenta la tabla: la activa, o la última finalizada.
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
    } catch { setScanMsg({ kind: 'err', text: 'Problema de red. Reintenta.' }); }
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

  const TABS = [
    { key: 'todos', label: 'Ejemplares', Icon: ClipboardList },
    { key: 'faltantes', label: viewing?.status === 'finalizado' ? 'Faltantes' : 'Pendientes', Icon: AlertTriangle },
    { key: 'fuera', label: 'Fuera de ubicación', Icon: MapPin },
    { key: 'prestados', label: 'Prestados', Icon: BookOpen },
    { key: 'anteriores', label: 'Anteriores', Icon: History },
    { key: 'bajas', label: 'Bajas', Icon: Trash2 },
  ];

  // Donut CSS (conic-gradient) con los resultados de la sesión visible.
  const donut = viewing && viewing.scanned + viewing.missing + viewing.onLoan > 0 ? (() => {
    const total = viewing.expected || 1;
    const f = (viewing.found / total) * 360;
    const m = (viewing.misplaced / total) * 360;
    const l = (viewing.onLoan / total) * 360;
    return `conic-gradient(var(--color-success-fg) 0deg ${f}deg, var(--color-warning-fg) ${f}deg ${f + m}deg, var(--color-info-text) ${f + m}deg ${f + m + l}deg, var(--color-surface-container) ${f + m + l}deg 360deg)`;
  })() : null;

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_290px] xl:items-start xl:gap-5">
      <div className="min-w-0">
        <div className="app-reveal">
          <SectionHeader
            level={1}
            title="Inventario"
            subtitle="Controlá y verificá los ejemplares físicos: escaneá uno a uno y el resultado se registra solo."
            actions={!active ? <Button variant="primary" onClick={() => setDrawer(true)}><Plus size={16} strokeWidth={2.2} /> Nuevo inventario</Button> : undefined}
          />
        </div>

        {/* ── Sesión activa / última ── */}
        {viewing ? (
          <Card padding="lg" className="app-reveal mt-5" style={{ animationDelay: '40ms' }}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3.5">
                <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-brand/10 text-brand"><ClipboardList size={22} strokeWidth={1.8} /></span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[16px] font-extrabold tracking-tight text-ink">{viewing.name}</h2>
                    {viewing.status === 'en_progreso'
                      ? <Chip tone="brand" dot>En progreso</Chip>
                      : <Chip tone="neutral">Finalizado</Chip>}
                  </div>
                  <p className="mt-1 text-[12.5px] text-muted">
                    {viewing.startedByName ? <>Iniciado por: <b className="text-ink">{viewing.startedByName}</b> · </> : null}
                    {fmtDate(viewing.startedAt)} · Alcance: <b className="text-ink">{viewing.siteName ?? 'Todo el acervo'}</b>
                  </p>
                </div>
              </div>
              <div className="w-full md:w-72">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-faint">Progreso</span>
                  <span className="text-[18px] font-extrabold tabular-nums text-ink">{pct}%</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-container">
                  <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-[12px] tabular-nums text-muted">Escaneados: <b className="text-ink">{fmt(viewing.scanned)} / {fmt(viewing.expected)}</b></p>
                {active ? (
                  finishing ? (
                    <div className="mt-2.5 flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setFinishing(false)} disabled={busyFinish}>Seguir escaneando</Button>
                      <Button variant="primary" size="sm" onClick={finish} disabled={busyFinish}>
                        {busyFinish ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={2.2} />} Confirmar cierre
                      </Button>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" className="mt-2.5" onClick={() => setFinishing(true)}>Finalizar inventario</Button>
                  )
                ) : null}
              </div>
            </div>
            {finishing && active ? (
              <p className="mt-3 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-warning-fg">
                Al cerrar, los {fmt(active.missing)} sin escanear (y sin préstamo) quedan como <b>FALTANTES</b> en el resumen. Puedes seguir escaneando si todavía falta recorrer estantes.
              </p>
            ) : null}

            {/* Caja de escaneo */}
            {active ? (
              <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void scan(scanCode); }}>
                <label className={cn('flex items-center gap-2.5 rounded-xl border-2 border-brand/40 bg-surface px-3.5 py-3', focusRing)}>
                  <ScanBarcode size={19} className="flex-none text-brand" aria-hidden="true" />
                  <input ref={scanRef} value={scanCode} onChange={(e) => setScanCode(e.target.value)} autoFocus
                    placeholder="Escanea el código de barras del ejemplar (o escríbelo y Enter)…" aria-label="Escanear ejemplar"
                    className="w-full bg-transparent font-mono text-[15px] text-ink outline-none placeholder:font-sans placeholder:text-faint" />
                  {scanning ? <Loader2 size={16} className="animate-spin text-faint" /> : null}
                </label>
              </form>
            ) : null}
            {scanMsg ? (
              <p role="status" className={cn('mt-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold',
                scanMsg.kind === 'ok' ? 'bg-success-bg text-success-fg' : scanMsg.kind === 'warn' ? 'bg-warning-bg text-warning-fg' : 'bg-danger-bg text-danger-fg')}>
                {scanMsg.text}
              </p>
            ) : null}
          </Card>
        ) : (
          <Card padding="lg" className="app-reveal mt-5" style={{ animationDelay: '40ms' }}>
            <EmptyState icon={ClipboardList}
              title="Sin inventarios todavía"
              description="Abre una sesión (todo el acervo o un sitio) y escanea los ejemplares uno a uno — el resultado se registra solo."
              action={<Button variant="primary" onClick={() => setDrawer(true)}><Plus size={15} /> Nuevo inventario</Button>} />
          </Card>
        )}

        {/* ── Tabs ── */}
        <div className="app-reveal mt-4 flex gap-1 overflow-x-auto border-b border-line" style={{ animationDelay: '70ms' }} role="tablist" aria-label="Vistas del inventario">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              className={cn('flex flex-none items-center gap-1.5 px-3 py-2 text-[13px]', focusRing,
                tab === t.key ? 'border-b-2 border-brand font-bold text-brand' : 'font-medium text-muted hover:text-ink')}>
              <t.Icon size={14} strokeWidth={1.9} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'anteriores' ? (
          /* ── Inventarios anteriores ── */
          <div className="mt-4">
            {sessions.previous.length === 0 ? (
              <Card padding="lg"><p className="text-[13.5px] text-muted">Todavía no hay inventarios finalizados.</p></Card>
            ) : (
              <Card padding="none" className="overflow-hidden">
                <ul className="divide-y divide-line/70">
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
              </Card>
            )}
          </div>
        ) : (
          /* ── Tabla de ejemplares ── */
          <>
            <label className={cn('app-reveal mt-4 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5', focusRing)} style={{ animationDelay: '90ms' }}>
              <Search size={16} className="text-faint" aria-hidden="true" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="Buscar por título, autor, ISBN, código de barras o signatura…" aria-label="Buscar ejemplares"
                className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint" />
              {loading ? <Loader2 size={15} className="animate-spin text-faint" /> : null}
            </label>

            <div className={cn('mt-3 transition-opacity', loading && 'opacity-50')}>
              {!items || items.items.length === 0 ? (
                <Card padding="lg">
                  <p className="text-[13.5px] text-muted">
                    {tab === 'bajas' ? 'No hay ejemplares dados de baja.' : !viewing ? 'Abre un inventario para ver los ejemplares.' : q ? 'Sin resultados con esa búsqueda.' : 'Nada en esta vista.'}
                  </p>
                </Card>
              ) : (
                <Card padding="none" className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-line bg-surface-container/60 text-[11px] font-bold uppercase tracking-[0.05em] text-faint">
                          <th className="px-4 py-2.5">Código de barras</th>
                          <th className="px-3 py-2.5">Título / Autor</th>
                          <th className="px-3 py-2.5">Signatura</th>
                          <th className="px-3 py-2.5">Ubicación registrada</th>
                          <th className="px-3 py-2.5">{tab === 'bajas' ? 'Motivo de baja' : 'Estado'}</th>
                          <th className="px-3 py-2.5">{tab === 'bajas' ? 'Fecha' : 'Resultado'}</th>
                          <th className="px-3 py-2.5"><span className="sr-only">Acciones</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/70">
                        {items.items.map((it) => (
                          <tr key={it.itemId} className="transition-colors hover:bg-surface-container/40">
                            <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12.5px] font-bold tabular-nums text-ink">{it.inventoryCode}</td>
                            <td className="px-3 py-2.5">
                              <Link href={`/app/biblioteca/titulos/${it.titleId}`} className={cn('flex items-center gap-2.5 rounded-lg', focusRing)}>
                                <span className="grid h-11 w-8 flex-none place-items-center overflow-hidden rounded border border-line/60 bg-brand-accent">
                                  {it.coverUrl
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={it.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                                    : <BookOpen size={13} className="text-white/85" aria-hidden="true" />}
                                </span>
                                <span className="min-w-0">
                                  <span className="block max-w-[210px] truncate text-[13px] font-bold leading-tight text-ink hover:text-brand">{it.title}</span>
                                  <span className="block max-w-[210px] truncate text-[11px] text-muted">{it.authors[0] ?? ''}</span>
                                </span>
                              </Link>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] tabular-nums text-muted">{it.callNumber ?? '—'}</td>
                            <td className="px-3 py-2.5 text-[12px] text-muted">
                              {it.siteName ? <>{it.siteName}{it.shelf ? <span className="block text-[11px] text-faint">{it.shelf}</span> : null}</> : '—'}
                              {it.foundSiteName && it.resultado === 'fuera_ubicacion' ? (
                                <span className="block text-[10.5px] font-bold text-warning-fg">apareció en {it.foundSiteName}</span>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              {tab === 'bajas'
                                ? <span className="text-[12px] text-muted">{it.retiredReason ?? '—'}</span>
                                : <Chip tone={ESTADO_META[it.estado].tone} dot>{ESTADO_META[it.estado].label}</Chip>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              {tab === 'bajas'
                                ? <span className="text-[12px] tabular-nums text-muted">{it.scannedAt ? fmtDate(it.scannedAt) : '—'}</span>
                                : <ResultChip r={it.resultado} />}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <Link href={`/app/biblioteca/titulos/${it.titleId}`} aria-label={`Ver ficha de ${it.title}`}
                                className={cn('inline-grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-surface-container hover:text-ink', focusRing)}>
                                <Eye size={15} strokeWidth={1.9} />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
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
                        p === items.page ? 'bg-brand text-white' : 'text-muted hover:bg-surface-container')}>
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
      </div>

      {/* ── Carril derecho ── */}
      <aside className="mt-5 xl:mt-0">
        {viewing ? (
          <>
            <Card padding="md" className="app-reveal" style={{ animationDelay: '60ms' }}>
              <h2 className="text-[14px] font-bold tracking-tight text-ink">Resumen del inventario</h2>
              <dl className="mt-2 divide-y divide-line/60">
                <SummaryRow label="Total de ejemplares" value={viewing.expected} tone="text-ink" />
                <SummaryRow label="Escaneados" value={viewing.scanned} tone="text-ink" />
                <SummaryRow label="Encontrados" value={viewing.found} tone="text-success-fg" />
                <SummaryRow label="Fuera de ubicación" value={viewing.misplaced} tone={viewing.misplaced > 0 ? 'text-warning-fg' : 'text-ink'} />
                <SummaryRow label="Prestados (en la calle)" value={viewing.onLoan} tone="text-info-text" />
                <SummaryRow label={viewing.status === 'finalizado' ? 'Faltantes' : 'Pendientes por escanear'} value={viewing.missing} tone={viewing.status === 'finalizado' && viewing.missing > 0 ? 'text-danger-fg' : 'text-ink'} />
              </dl>
              <div className="mt-2.5 flex items-baseline justify-between border-t border-line/60 pt-2">
                <span className="text-[12.5px] font-bold text-ink">Completado</span>
                <span className="text-[16px] font-extrabold tabular-nums text-brand">{pct}%</span>
              </div>
            </Card>

            {donut ? (
              <Card padding="md" className="app-reveal mt-4" style={{ animationDelay: '90ms' }}>
                <h2 className="text-[14px] font-bold tracking-tight text-ink">Resultados</h2>
                <div className="mt-3 flex items-center gap-4">
                  <span className="relative grid h-24 w-24 flex-none place-items-center rounded-full" style={{ background: donut }} aria-hidden="true">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-[13px] font-extrabold tabular-nums text-ink">{pct}%</span>
                  </span>
                  <ul className="flex flex-col gap-1.5 text-[11.5px]">
                    <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-success-fg" /> Encontrados <b className="tabular-nums">{fmt(viewing.found)}</b></li>
                    <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-warning-fg" /> Fuera de ubicación <b className="tabular-nums">{fmt(viewing.misplaced)}</b></li>
                    <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-info-text" /> Prestados <b className="tabular-nums">{fmt(viewing.onLoan)}</b></li>
                    <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-surface-container" /> {viewing.status === 'finalizado' ? 'Faltantes' : 'Pendientes'} <b className="tabular-nums">{fmt(viewing.missing)}</b></li>
                  </ul>
                </div>
              </Card>
            ) : null}

            <Card padding="md" className="app-reveal mt-4" style={{ animationDelay: '120ms' }}>
              <h2 className="text-[14px] font-bold tracking-tight text-ink">Herramientas</h2>
              <div className="mt-2 flex flex-col gap-1">
                <a href={`/app/biblioteca/api/inventories/${viewing.id}/export`} download
                  className={cn('flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-surface-container', focusRing)}>
                  <Download size={15} className="text-brand" strokeWidth={1.9} /> Exportar resultados (Excel)
                </a>
                <button type="button" onClick={() => { setTab('faltantes'); setPage(1); }}
                  className={cn('flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-semibold text-ink hover:bg-surface-container', focusRing)}>
                  <Search size={15} className="text-brand" strokeWidth={1.9} /> Ver {viewing.status === 'finalizado' ? 'faltantes' : 'pendientes'}
                </button>
                <span className="flex cursor-default items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold text-faint" title="Llega en una fase posterior">
                  <Printer size={15} strokeWidth={1.9} /> Imprimir etiquetas de códigos <Chip tone="neutral">Pronto</Chip>
                </span>
              </div>
            </Card>
          </>
        ) : null}

        <Card padding="md" className="app-reveal mt-4 border-brand/25 bg-brand/[0.04]" style={{ animationDelay: '150ms' }}>
          <h2 className="flex items-center gap-1.5 text-[14px] font-bold tracking-tight text-ink"><CircleCheck size={14} className="text-brand" /> Consejo</h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            Escanea los códigos de los ejemplares uno por uno para verificar su existencia y ubicación.
            Lo que figura prestado no cuenta como faltante: está en la calle, no perdido.
          </p>
        </Card>
      </aside>

      <NewInventoryDrawer open={drawer} sites={sites} onClose={() => setDrawer(false)}
        onCreated={() => { setDrawer(false); void refreshSessions(); setTab('todos'); setPage(1); }} />
    </div>
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

// ── Nuevo inventario: nombre + alcance ───────────────────────────────────────
function NewInventoryDrawer({ open, sites, onClose, onCreated }: {
  open: boolean; sites: BiblioSite[]; onClose: () => void; onCreated: () => void;
}) {
  const titleId = useId();
  const [name, setName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busyRef = useRef(busy); busyRef.current = busy;
  const reset = () => { setName(''); setSiteId(''); setError(null); };
  const { mounted, closing, panelRef } = useDrawerLifecycle({ open, onEscape: () => { if (!busyRef.current) onClose(); }, onClosed: reset });

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
    } catch { setError('Problema de red. Reintenta.'); setBusy(false); }
  }

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(
    <div tabIndex={-1} className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div aria-hidden="true"
        className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')} />
      <div ref={panelRef} className={cn(
        'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t border-line bg-surface shadow-xl',
        'md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:h-auto md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0',
        'flex flex-col', closing && 'drawer-panel--closing')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Inventario</p>
            <h2 id={titleId} className="mt-1 text-lg font-bold leading-tight tracking-tight text-ink">Nuevo inventario</h2>
          </div>
          <IconButton label="Cerrar" variant="outline" size="sm" onClick={onClose} disabled={busy}><X size={18} /></IconButton>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus
              placeholder="Ej. Inventario anual 2026 — Sala General"
              className={cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink', focusRing)} />
          </label>
          <label className="mt-4 block">
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

          {error ? <p role="status" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger-fg">{error}</p> : null}

          <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" disabled={busy || !name.trim()}>
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={2.2} />} Abrir inventario
          </Button>
          <p className="mb-1 mt-2 text-center text-[12px] text-muted">Solo puede haber un inventario en progreso a la vez.</p>
        </form>
      </div>
    </div>,
    document.body,
  );
}
