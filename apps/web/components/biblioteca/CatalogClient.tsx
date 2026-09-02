'use client';

// components/biblioteca/CatalogClient.tsx · Catálogo de la Biblioteca (F1),
// modelo aprobado por el usuario (captura "Biblioteca Central · Catálogo"):
//   · panel de búsqueda con filtros (tipo / colección / ubicación / solo disponibles)
//   · resultados en TABLA (portada, ISBN, autor, tipo, año, ubicación, disponibilidad)
//     o en TARJETAS (estantería de portadas)
//   · export .xlsx con los filtros activos + paginación numerada
//   · carril derecho: acciones rápidas + estadísticas del catálogo
// Lo que depende de Circulación (préstamos/reservas/importar/etiquetas) se
// muestra como "Pronto" honesto. Server manda la primera página; los filtros
// re-fetchean vía el BFF.

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  Library, Search, Plus, X, Loader2, Check, BookOpen, Newspaper, GraduationCap, Film, FileText, ScrollText, Sparkles,
  LayoutGrid, Table2, ScanBarcode, Download, Printer, Upload, Eye, ChevronLeft, ChevronRight, BarChart3, MapPin,
} from 'lucide-react';
import type { BiblioTitlesListResponse, BiblioTitle, BiblioSite, BiblioKind, BiblioIsbnLookupResponse, BiblioFacetsResponse } from '@contan2/contracts';
import { Card, Button, IconButton, Field, Chip, EmptyState, SectionHeader, cn, focusRing, useDrawerLifecycle } from '../ui';

const KIND_META: Record<BiblioKind, { label: string; Icon: typeof BookOpen }> = {
  libro: { label: 'Libro', Icon: BookOpen },
  revista: { label: 'Revista', Icon: Newspaper },
  periodico: { label: 'Periódico', Icon: ScrollText },
  tesis: { label: 'Tesis', Icon: GraduationCap },
  audiovisual: { label: 'Audiovisual', Icon: Film },
  documento: { label: 'Documento', Icon: FileText },
};
const KINDS = Object.keys(KIND_META) as BiblioKind[];

const fmt = (n: number) => n.toLocaleString('en-US');

// Ventana de páginas para la paginación numerada: 1 … c-1 c c+1 … N.
function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  if (current > 3) out.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p += 1) out.push(p);
  if (current < total - 2) out.push('…');
  out.push(total);
  return out;
}

export function CatalogClient({ initial, initialQ = '', sites, facets }: {
  initial: BiblioTitlesListResponse; initialQ?: string; sites: BiblioSite[]; facets: BiblioFacetsResponse | null;
}) {
  const [data, setData] = useState(initial);
  const [q, setQ] = useState(initialQ);
  const [kind, setKind] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('');
  const [disponible, setDisponible] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [view, setView] = useState<'tabla' | 'tarjetas'>('tabla');
  const searchRef = useRef<HTMLInputElement>(null);
  const first = useRef(true);

  const filterParams = () => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (kind) p.set('kind', kind);
    if (subject) p.set('subject', subject);
    if (siteId) p.set('siteId', siteId);
    if (disponible) p.set('disponible', '1');
    return p;
  };

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const p = filterParams();
        p.set('page', String(page));
        p.set('pageSize', String(pageSize));
        const res = await fetch(`/app/biblioteca/api/titles?${p.toString()}`, { cache: 'no-store', signal: ctl.signal });
        if (res.ok) setData(await res.json() as BiblioTitlesListResponse);
      } catch { /* abort */ } finally { setLoading(false); }
    }, q ? 300 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, kind, subject, siteId, disponible, page, pageSize]);

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const hasFilters = !!(q.trim() || kind || subject || siteId || disponible);
  const resetPage = () => setPage(1);
  const limpiar = () => { setQ(''); setKind(''); setSubject(''); setSiteId(''); setDisponible(false); setPage(1); };
  const focusScan = () => { searchRef.current?.focus(); searchRef.current?.select(); };
  const exportHref = `/app/biblioteca/api/export?${filterParams().toString()}`;
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.total, data.page * data.pageSize);

  const selectCls = cn('min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink', focusRing);

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_290px] xl:items-start xl:gap-5">
      <div className="min-w-0">
        <div className="app-reveal">
          <SectionHeader
            level={1}
            title="Catálogo"
            subtitle="Títulos y ejemplares del acervo. Un título es la obra; cada copia física es un ejemplar con su propio código."
            actions={<Button variant="primary" onClick={() => setDrawer(true)}><Plus size={16} strokeWidth={2.2} /> Nuevo título</Button>}
          />
        </div>

        {/* ── Panel de búsqueda + filtros ── */}
        <Card padding="md" className="app-reveal mt-5" style={{ animationDelay: '40ms' }}>
          <div className="flex flex-wrap items-center gap-2">
            <label className={cn('flex min-w-[240px] flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5', focusRing)}>
              <Search size={16} className="text-faint" aria-hidden="true" />
              <input ref={searchRef} value={q} onChange={(e) => { setQ(e.target.value); resetPage(); }}
                placeholder="Título, autor o ISBN…" aria-label="Buscar en el catálogo"
                className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint" />
              {loading ? <Loader2 size={15} className="animate-spin text-faint" /> : null}
            </label>
            <IconButton label="Leer código de barras (el lector escribe el ISBN en la búsqueda)" variant="outline" onClick={focusScan}>
              <ScanBarcode size={17} strokeWidth={1.9} />
            </IconButton>
            <Button variant="secondary" onClick={limpiar} disabled={!hasFilters}>Limpiar</Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-faint">Tipo de material</span>
              <select value={kind} onChange={(e) => { setKind(e.target.value); resetPage(); }} className={selectCls}>
                <option value="">Todos</option>
                {(facets?.kinds ?? []).map((k) => <option key={k.kind} value={k.kind}>{KIND_META[k.kind]?.label ?? k.kind} ({fmt(k.count)})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-faint">Colección / materia</span>
              <select value={subject} onChange={(e) => { setSubject(e.target.value); resetPage(); }} className={selectCls}>
                <option value="">Todas</option>
                {(facets?.subjects ?? []).map((s) => <option key={s.subject} value={s.subject}>{s.subject} ({fmt(s.count)})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-faint">Ubicación</span>
              <select value={siteId} onChange={(e) => { setSiteId(e.target.value); resetPage(); }} className={selectCls}>
                <option value="">Todas</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name} ({fmt(s.items ?? 0)})</option>)}
              </select>
            </label>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-1 py-2">
              <button type="button" role="switch" aria-checked={disponible} onClick={() => { setDisponible((v) => !v); resetPage(); }}
                className={cn('relative h-5.5 w-10 flex-none rounded-full transition-colors', focusRing, disponible ? 'bg-brand' : 'bg-line')}>
                <span className={cn('absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-[left]', disponible ? 'left-5' : 'left-0.5')} />
              </button>
              <span className="text-[12.5px] font-semibold text-muted">Solo disponibles</span>
            </label>
          </div>
        </Card>

        {/* ── Barra de resultados ── */}
        <div className="app-reveal mt-4 flex flex-wrap items-center gap-2.5" style={{ animationDelay: '80ms' }}>
          <p className="text-[14px] font-bold text-ink" aria-live="polite">
            {fmt(data.total)} {data.total === 1 ? 'registro encontrado' : 'registros encontrados'}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[12px] font-semibold text-faint sm:block">Vista:</span>
            <div className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Cambiar vista">
              <button type="button" aria-pressed={view === 'tabla'} onClick={() => setView('tabla')}
                className={cn('flex h-9 items-center gap-1.5 px-3 text-[12.5px] font-bold', focusRing, view === 'tabla' ? 'bg-brand text-white' : 'bg-surface text-muted hover:bg-surface-container')}>
                <Table2 size={15} strokeWidth={2} /> Tabla
              </button>
              <button type="button" aria-pressed={view === 'tarjetas'} onClick={() => setView('tarjetas')}
                className={cn('flex h-9 items-center gap-1.5 px-3 text-[12.5px] font-bold', focusRing, view === 'tarjetas' ? 'bg-brand text-white' : 'bg-surface text-muted hover:bg-surface-container')}>
                <LayoutGrid size={15} strokeWidth={2} /> Tarjetas
              </button>
            </div>
            <a href={exportHref} download
              className={cn('flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12.5px] font-bold text-muted hover:bg-surface-container hover:text-ink', focusRing)}>
              <Download size={15} strokeWidth={2} /> Exportar
            </a>
          </div>
        </div>

        {/* ── Resultados ── */}
        <div className={cn('mt-3 transition-opacity', loading && 'opacity-50')}>
          {data.titles.length === 0 ? (
            <Card padding="lg">
              <EmptyState icon={Library}
                title={data.total === 0 && !hasFilters ? 'El catálogo está vacío' : 'Sin resultados'}
                description={data.total === 0 && !hasFilters
                  ? 'Registrá el primer título — con el ISBN, la ficha se completa sola.'
                  : 'Probá con otra parte del título, el autor o el ISBN, o quitá filtros.'}
                action={<Button variant="primary" onClick={() => setDrawer(true)}><Plus size={15} /> Nuevo título</Button>} />
            </Card>
          ) : view === 'tabla' ? (
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line bg-surface-container/60 text-[11px] font-bold uppercase tracking-[0.05em] text-faint">
                      <th className="px-4 py-2.5">Título</th>
                      <th className="px-3 py-2.5">Autor</th>
                      <th className="px-3 py-2.5">Tipo</th>
                      <th className="px-3 py-2.5">Año</th>
                      <th className="px-3 py-2.5">Ubicación</th>
                      <th className="px-3 py-2.5">Disponibilidad</th>
                      <th className="px-3 py-2.5"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {data.titles.map((t) => <CatalogTableRow key={t.id} t={t} />)}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-6">
              {data.titles.map((t) => <TitleCoverCard key={t.id} t={t} />)}
            </div>
          )}

          {/* ── Paginación ── */}
          {data.total > 0 ? (
            <div className="mt-3.5 flex flex-wrap items-center gap-3 text-[12.5px] text-muted">
              <label className="flex items-center gap-1.5">
                Mostrando
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  aria-label="Registros por página"
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
                        p === data.page ? 'bg-brand text-white' : 'text-muted hover:bg-surface-container')}>
                      {p}
                    </button>
                  ))}
                  <IconButton label="Página siguiente" variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight size={15} />
                  </IconButton>
                </nav>
              ) : null}
              <span className="ml-auto tabular-nums">{fmt(from)}–{fmt(to)} de {fmt(data.total)} registros</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Carril derecho: acciones rápidas + estadísticas ── */}
      <aside className="mt-5 hidden xl:mt-0 xl:block">
        <Card padding="md" className="app-reveal" style={{ animationDelay: '60ms' }}>
          <h2 className="text-[14px] font-bold tracking-tight text-ink">Acciones rápidas</h2>
          <div className="mt-2.5 flex flex-col gap-1">
            <RailAction Icon={BookOpen} label="Nuevo título" hint="Con ISBN la ficha se completa sola" onClick={() => setDrawer(true)} />
            <RailAction Icon={ScanBarcode} label="Lectura de código" hint="El lector escribe el ISBN en la búsqueda" onClick={focusScan} />
            <RailAction Icon={Upload} label="Importar registros" hint="Desde archivo CSV o Excel" soon />
            <RailAction Icon={Printer} label="Imprimir etiquetas" hint="Códigos de barras de ejemplares" soon />
          </div>
        </Card>

        {facets ? (
          <Card padding="md" className="app-reveal mt-4" style={{ animationDelay: '100ms' }}>
            <h2 className="text-[14px] font-bold tracking-tight text-ink">Estadísticas del catálogo</h2>
            <dl className="mt-2 divide-y divide-line/60">
              <RailStat label="Títulos únicos" value={facets.total} />
              <RailStat label="Ejemplares" value={facets.items?.total ?? 0} />
              <RailStat label="Disponibles" value={facets.items?.active ?? 0} tone="text-success-fg" />
              <RailStat label="Sitios físicos" value={sites.length} />
            </dl>
            <p className="mt-3 text-[11.5px] leading-relaxed text-faint">Prestados y reservados llegan con Circulación (F2).</p>
            <button type="button" disabled title="Llega con Reportes de la biblioteca"
              className="mt-3 flex w-full cursor-default items-center justify-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-[12.5px] font-bold text-faint">
              <BarChart3 size={14} strokeWidth={2} /> Ver reporte completo · Pronto
            </button>
          </Card>
        ) : null}
      </aside>

      <NewTitleDrawer open={drawer} onClose={() => setDrawer(false)} sitesCount={sites.length} />
    </div>
  );
}

function RailAction({ Icon, label, hint, onClick, soon }: {
  Icon: typeof BookOpen; label: string; hint: string; onClick?: () => void; soon?: boolean;
}) {
  const inner = (
    <>
      <span className={cn('grid h-9 w-9 flex-none place-items-center rounded-xl', soon ? 'bg-surface-container text-faint' : 'bg-brand/10 text-brand')}>
        <Icon size={17} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={cn('block text-[13px] font-bold leading-tight', soon ? 'text-faint' : 'text-ink')}>{label}</span>
        <span className="block truncate text-[11.5px] text-faint">{hint}</span>
      </span>
      {soon ? <Chip tone="neutral">Pronto</Chip> : null}
    </>
  );
  if (soon) return <div className="flex cursor-default items-center gap-2.5 rounded-xl px-2 py-2" title="Llega en las próximas fases">{inner}</div>;
  return (
    <button type="button" onClick={onClick} className={cn('flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-surface-container', focusRing)}>
      {inner}
    </button>
  );
}

function RailStat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className={cn('text-[15px] font-extrabold tabular-nums', tone ?? 'text-ink')}>{fmt(value)}</dd>
    </div>
  );
}

// Paleta de "lomos" para portadas sin imagen (determinística por título).
const SPINE_COLORS = ['#1a6194', '#7c3aed', '#0f766e', '#b45309', '#be185d', '#4d7c0f', '#1d4ed8', '#a21caf'];
function spineColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SPINE_COLORS[h % SPINE_COLORS.length]!;
}

// Disponibilidad del título en F1 (sin préstamos todavía): estados del acervo.
function AvailabilityChip({ t }: { t: BiblioTitle }) {
  if (t.itemsTotal === 0) return <Chip tone="neutral">Sin ejemplares</Chip>;
  if (t.itemsActive === 0) return <Chip tone="danger" dot>No disponible</Chip>;
  return <Chip tone="success" dot>Disponible · {t.itemsActive} de {t.itemsTotal}</Chip>;
}

function CatalogTableRow({ t }: { t: BiblioTitle }) {
  const { label, Icon } = KIND_META[t.kind] ?? KIND_META.libro;
  const href = `/app/biblioteca/titulos/${t.id}`;
  return (
    <tr className="group transition-colors hover:bg-surface-container/40">
      <td className="px-4 py-2.5">
        <Link href={href} className={cn('flex items-center gap-3 rounded-lg', focusRing)}>
          <span className="grid h-12 w-9 flex-none place-items-center overflow-hidden rounded-md border border-line/60 shadow-sm" style={{ background: t.coverUrl ? undefined : spineColor(t.title) }}>
            {t.coverUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={t.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              : <Icon size={15} strokeWidth={1.9} className="text-white/85" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block max-w-[300px] truncate text-[13.5px] font-bold leading-tight text-ink group-hover:text-brand">{t.title}</span>
            {t.isbn ? <span className="block font-mono text-[11px] text-faint tabular-nums">ISBN: {t.isbn}</span> : null}
          </span>
        </Link>
      </td>
      <td className="max-w-[180px] truncate px-3 py-2.5 text-[13px] text-muted">{t.authors.join(', ') || '—'}</td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted"><Icon size={14} strokeWidth={1.9} className="text-brand" /> {label}</span>
      </td>
      <td className="px-3 py-2.5 text-[13px] tabular-nums text-muted">{t.year ?? '—'}</td>
      <td className="px-3 py-2.5 text-[12.5px] text-muted">
        {t.siteNames.length === 0 ? '—' : (
          <span className="inline-flex items-center gap-1"><MapPin size={12.5} className="flex-none text-faint" aria-hidden="true" />
            {t.siteNames[0]}{t.siteNames.length > 1 ? ` +${t.siteNames.length - 1}` : ''}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5"><AvailabilityChip t={t} /></td>
      <td className="px-3 py-2.5 text-right">
        <Link href={href} aria-label={`Ver ficha de ${t.title}`}
          className={cn('inline-grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-surface-container hover:text-ink', focusRing)}>
          <Eye size={15} strokeWidth={1.9} />
        </Link>
      </td>
    </tr>
  );
}

function TitleCoverCard({ t }: { t: BiblioTitle }) {
  const { Icon } = KIND_META[t.kind] ?? KIND_META.libro;
  const agotado = t.itemsTotal > 0 && t.itemsActive === 0;
  return (
    <Link href={`/app/biblioteca/titulos/${t.id}`} className={cn('group block min-w-0 rounded-xl', focusRing)}>
      <span className="relative block aspect-[2/3] overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition-transform duration-150 group-hover:-translate-y-1 group-hover:shadow-md">
        {t.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full flex-col justify-between p-3 text-white" style={{ background: `linear-gradient(165deg, ${spineColor(t.title)}, ${spineColor(t.title)}cc)` }}>
            <Icon size={18} strokeWidth={1.8} className="opacity-70" aria-hidden="true" />
            <span className="text-[12.5px] font-bold leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:5] overflow-hidden">{t.title}</span>
          </span>
        )}
        {t.itemsTotal === 0 ? (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/70 px-1.5 py-0.5 text-[10px] font-bold text-white">Sin ejemplares</span>
        ) : agotado ? (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-[#c5221f] px-1.5 py-0.5 text-[10px] font-bold text-white">No disponible</span>
        ) : (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-[#137333] px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">{t.itemsActive} disp.</span>
        )}
      </span>
      <span className="mt-1.5 block truncate text-[12.5px] font-bold leading-tight text-ink" title={t.title}>{t.title}</span>
      <span className="block truncate text-[11px] text-muted">{t.authors[0] ?? (t.year ? String(t.year) : KIND_META[t.kind]?.label ?? '')}</span>
    </Link>
  );
}

// ── Alta de título con autofill por ISBN ─────────────────────────────────────
function NewTitleDrawer({ open, onClose, sitesCount }: { open: boolean; onClose: () => void; sitesCount: number }) {
  const router = useRouter();
  const titleId = useId();
  const [f, setF] = useState({ isbn: '', title: '', subtitle: '', authors: '', publisher: '', year: '', language: '', dewey: '', callNumber: '' });
  const [kind, setKind] = useState<BiblioKind>('libro');
  const [autofill, setAutofill] = useState<{ source: string } | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookMsg, setLookMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busyRef = useRef(busy); busyRef.current = busy;
  const reset = () => { setF({ isbn: '', title: '', subtitle: '', authors: '', publisher: '', year: '', language: '', dewey: '', callNumber: '' }); setKind('libro'); setAutofill(null); setCoverUrl(null); setLookMsg(null); setError(null); };
  const { mounted, closing, panelRef } = useDrawerLifecycle({ open, onEscape: () => { if (!busyRef.current) onClose(); }, onClosed: reset });

  async function buscarIsbn() {
    if (!f.isbn.trim() || looking) return;
    setLooking(true); setLookMsg(null);
    try {
      const res = await fetch(`/app/biblioteca/api/isbn/${encodeURIComponent(f.isbn.trim())}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null) as BiblioIsbnLookupResponse | null;
      if (res.ok && j?.found && j.data) {
        const d = j.data;
        setF((prev) => ({
          ...prev,
          title: d.title ?? prev.title,
          subtitle: d.subtitle ?? prev.subtitle,
          authors: d.authors?.length ? d.authors.join(', ') : prev.authors,
          publisher: d.publisher ?? prev.publisher,
          year: d.year ? String(d.year) : prev.year,
          language: d.language ?? prev.language,
        }));
        setCoverUrl(d.coverUrl ?? null);
        setAutofill({ source: j.source === 'googlebooks' ? 'Google Books' : j.source === 'cache' ? 'el catálogo global' : 'OpenLibrary' });
      } else {
        setAutofill(null);
        setLookMsg('No encontramos ese ISBN — completá la ficha a mano.');
      }
    } catch { setLookMsg('No pudimos consultar el ISBN. Completá la ficha a mano.'); }
    finally { setLooking(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/app/biblioteca/api/titles', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          isbn: f.isbn.trim() || null,
          title: f.title.trim(),
          subtitle: f.subtitle.trim() || null,
          authors: f.authors.split(',').map((a) => a.trim()).filter(Boolean).slice(0, 10),
          publisher: f.publisher.trim() || null,
          year: f.year.trim() ? Number(f.year) : null,
          language: f.language.trim() || null,
          dewey: f.dewey.trim() || null,
          callNumber: f.callNumber.trim() || null,
          coverUrl,
          isbnAutofilled: !!autofill,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.title?.id) { setError(j.error ?? 'No se pudo crear el título.'); setBusy(false); return; }
      router.push(`/app/biblioteca/titulos/${j.title.id}`);
    } catch { setError('Problema de red. Reintentá.'); setBusy(false); }
  }

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(
    <div tabIndex={-1} className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!busy) onClose(); }}
        className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')} />
      <div ref={panelRef} className={cn(
        'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t border-line bg-surface shadow-xl',
        'md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:h-auto md:w-full md:max-w-lg md:rounded-none md:border-l md:border-t-0',
        'flex flex-col', closing && 'drawer-panel--closing')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Catálogo</p>
            <h2 id={titleId} className="mt-1 text-lg font-bold leading-tight tracking-tight text-ink">Nuevo título</h2>
          </div>
          <IconButton label="Cerrar" variant="outline" size="sm" onClick={onClose} disabled={busy}><X size={18} /></IconButton>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          {/* ISBN primero: la ficha se llena sola (D8) */}
          <div className="rounded-xl border border-line bg-surface-container/50 p-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Empezá por el ISBN (opcional)</span>
            <div className="mt-1.5 flex gap-2">
              <input value={f.isbn} onChange={(e) => setF({ ...f, isbn: e.target.value })} placeholder="978-…"
                aria-label="ISBN" className={cn('min-h-11 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[14px] text-ink', focusRing)} />
              <Button type="button" variant="secondary" onClick={buscarIsbn} disabled={looking || !f.isbn.trim()}>
                {looking ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Buscar
              </Button>
            </div>
            {autofill ? <p className="mt-2 text-[12px] font-semibold text-success-fg">✓ Ficha completada desde {autofill.source} — revisá y ajustá lo que haga falta.</p> : null}
            {lookMsg ? <p className="mt-2 text-[12px] text-muted">{lookMsg}</p> : null}
          </div>

          <div className="mt-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Tipo</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <Button key={k} type="button" variant="pill" size="sm" selected={kind === k} onClick={() => setKind(k)}>{KIND_META[k].label}</Button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            <Field label="Título" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <Field label="Subtítulo (opcional)" value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} />
            <Field label="Autores (separados por coma)" value={f.authors} onChange={(e) => setF({ ...f, authors: e.target.value })} placeholder="García Márquez, Gabriel" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Editorial" value={f.publisher} onChange={(e) => setF({ ...f, publisher: e.target.value })} />
              <Field label="Año" inputMode="numeric" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
              <Field label="Idioma" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} placeholder="Español" />
              <Field label="Dewey" value={f.dewey} onChange={(e) => setF({ ...f, dewey: e.target.value })} placeholder="709.7293" />
            </div>
            <Field label="Signatura topográfica" value={f.callNumber} onChange={(e) => setF({ ...f, callNumber: e.target.value })} placeholder="709.7293 A347u" />
          </div>

          {error ? <p role="status" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger-fg">{error}</p> : null}
          {sitesCount === 0 ? <p className="mt-3 text-[12px] text-muted">Consejo: creá los sitios físicos (Biblioteca, depósitos…) para ubicar los ejemplares.</p> : null}

          <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" disabled={busy || !f.title.trim()}>
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={2.2} />} Crear título
          </Button>
          <p className="mb-1 mt-2 text-center text-[12px] text-muted">Después de crearlo vas directo a la ficha para agregar sus ejemplares.</p>
        </form>
      </div>
    </div>,
    document.body,
  );
}
