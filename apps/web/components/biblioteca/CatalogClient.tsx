'use client';

// components/biblioteca/CatalogClient.tsx · Catálogo de la Biblioteca (F7 redesign):
//   · Toolbar: búsqueda + filtro Género + filtro Disponibilidad
//   · DataTable: portada 40×56 + título + autor / ISBN / Género / Disponibles / Estado / Acciones
//   · Sin panel lateral; la tabla ocupa el 100 %
//   · Tarjetas en móvil (via DataTableClient mobileCard, sin scroll horizontal)
//   · Vista tarjetas (cuadrícula) accesible desde toggle

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Library, Search, BookPlus, Loader2, BookOpen, Newspaper, GraduationCap, Film, FileText, ScrollText,
  Upload, Eye, MoreHorizontal, LayoutGrid, Table2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { BiblioTitlesListResponse, BiblioTitle, BiblioSite, BiblioKind, BiblioFacetsResponse } from '@contan2/contracts';
import {
  Card, Button, IconButton, Chip, EmptyState, SectionHeader, Badge,
  DataTableClient, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  cn, focusRing,
} from '../ui';
import type { DataTableColumn } from '../ui';
import { SplitButton } from '../ui/arc/split-button/SplitButton';
import { numero } from '../../lib/format';
import { spineColor } from '../../lib/biblioteca/spine';
import { BibliotecaHeader } from './BibliotecaHeader';

const KIND_META: Record<BiblioKind, { label: string; Icon: typeof BookOpen }> = {
  libro:       { label: 'Libro',       Icon: BookOpen    },
  revista:     { label: 'Revista',     Icon: Newspaper   },
  periodico:   { label: 'Periódico',   Icon: ScrollText  },
  tesis:       { label: 'Tesis',       Icon: GraduationCap },
  audiovisual: { label: 'Audiovisual', Icon: Film        },
  documento:   { label: 'Documento',   Icon: FileText    },
};
const KINDS = Object.keys(KIND_META) as BiblioKind[];

// Ventana de páginas para paginación numerada.
function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  if (current > 3) out.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p += 1) out.push(p);
  if (current < total - 2) out.push('…');
  out.push(total);
  return out;
}


function CoverThumb({ t, className }: { t: BiblioTitle; className?: string }) {
  const { Icon } = KIND_META[t.kind] ?? KIND_META.libro;
  return (
    <span
      className={cn('grid flex-none place-items-center overflow-hidden rounded border border-line/60', className)}
      style={{ background: t.coverUrl ? undefined : spineColor(t.title) }}
    >
      {t.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Icon size={14} strokeWidth={1.9} className="text-white/80" aria-hidden="true" />
      )}
    </span>
  );
}

function ActionsMenu({ t }: { t: BiblioTitle }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={`Acciones para ${t.title}`} variant="ghost" size="sm">
          <MoreHorizontal size={16} strokeWidth={1.9} />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem icon={Eye} asChild>
          <Link href={`/app/biblioteca/titulos/${t.id}`}>Ver ficha</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DisponiblesBadge({ t }: { t: BiblioTitle }) {
  if (t.itemsTotal === 0) return <Badge tone="neutral">Sin ejemplares</Badge>;
  const libres = Math.max(0, t.itemsActive - t.itemsLoaned);
  return libres > 0
    ? <Badge tone="success">Disponible</Badge>
    : <Badge tone="danger">Agotado</Badge>;
}

const TABLE_COLUMNS: DataTableColumn<BiblioTitle>[] = [
  {
    id: 'libro',
    header: 'Libro',
    cell: (t) => {
      const href = `/app/biblioteca/titulos/${t.id}`;
      return (
        <Link href={href} className={cn('flex items-center gap-3', focusRing)}>
          <CoverThumb t={t} className="h-14 w-10" />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-bold leading-tight text-ink">{t.title}</span>
            <span className="block truncate text-[12px] text-muted">{t.authors.join(', ') || '—'}</span>
          </span>
        </Link>
      );
    },
  },
  {
    id: 'isbn',
    header: 'ISBN',
    priority: 'lg',
    cell: (t) => (
      <span className="num font-mono text-[12px] text-muted tabular-nums">{t.isbn ?? '—'}</span>
    ),
  },
  {
    id: 'genero',
    header: 'Género',
    priority: 'lg',
    cell: (t) => <Badge tone="neutral">{KIND_META[t.kind]?.label ?? t.kind}</Badge>,
  },
  {
    id: 'disponibles',
    header: 'Disponibles',
    priority: 'md',
    align: 'right',
    cell: (t) => {
      const libres = Math.max(0, t.itemsActive - t.itemsLoaned);
      return (
        <span className="num text-[13px] tabular-nums text-ink">
          {numero(libres)} / {numero(t.itemsActive)}
        </span>
      );
    },
  },
  {
    id: 'estado',
    header: 'Estado',
    priority: 'md',
    cell: (t) => <DisponiblesBadge t={t} />,
  },
  {
    id: 'acciones',
    header: '',
    align: 'right',
    width: 56,
    cell: (t) => <ActionsMenu t={t} />,
  },
];

export function CatalogClient({ initial, initialQ = '', sites, facets }: {
  initial: BiblioTitlesListResponse; initialQ?: string; sites: BiblioSite[]; facets: BiblioFacetsResponse | null;
}) {
  const [data, setData] = useState(initial);
  const [q, setQ] = useState(initialQ);
  const [kind, setKind] = useState<string>('');
  const [disponible, setDisponible] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'tabla' | 'tarjetas'>('tabla');
  const router = useRouter();
  const first = useRef(true);

  const filterParams = () => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (kind) p.set('kind', kind);
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
  }, [q, kind, disponible, page, pageSize]);

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const hasFilters = !!(q.trim() || kind || disponible);
  const resetPage = () => setPage(1);
  const limpiar = () => { setQ(''); setKind(''); setDisponible(false); setPage(1); };

  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.total, data.page * data.pageSize);

  const selectCls = cn('min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink', focusRing);

  return (
    <div>
      {/* Cabecera */}
      <BibliotecaHeader as="p" />
      <div className="app-reveal mt-6">
        <SectionHeader
          level={1}
          title="Catálogo"
          subtitle="Títulos y ejemplares del acervo."
          actions={
            <>
              <Button variant="secondary" disabled title="Llega con el import por lotes">
                <Upload size={15} strokeWidth={2} /> Importar <Chip tone="neutral">Pronto</Chip>
              </Button>
              <SplitButton
                label="Agregar libro"
                icon={BookPlus}
                href="/app/biblioteca/titulos/nuevo"
                menuLabel="Más formas de agregar un libro"
                actions={[
                  { label: 'Por ISBN (autocompletar)', href: '/app/biblioteca/titulos/nuevo?modo=isbn' },
                  { label: 'Manual', href: '/app/biblioteca/titulos/nuevo?modo=manual' },
                ]}
              />
            </>
          }
        />
      </div>

      {/* Toolbar: búsqueda + Género + Disponibilidad */}
      <div className="app-reveal mt-5 flex flex-wrap items-end gap-2.5" style={{ animationDelay: '40ms' }}>
        <label className={cn('flex min-w-[240px] flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5', focusRing)}>
          <Search size={16} className="text-faint" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); resetPage(); }}
            placeholder="Título, autor o ISBN"
            aria-label="Buscar en el catálogo"
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
          />
          {loading ? <Loader2 size={15} className="animate-spin text-faint" /> : null}
        </label>

        <label className="block shrink-0">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-faint">Género</span>
          <select value={kind} onChange={(e) => { setKind(e.target.value); resetPage(); }} className={cn(selectCls, 'w-36')}>
            <option value="">Todos</option>
            {(facets?.kinds ?? []).map((k) => <option key={k.kind} value={k.kind}>{KIND_META[k.kind]?.label ?? k.kind} ({numero(k.count)})</option>)}
          </select>
        </label>

        <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg py-2 pr-1">
          <button
            type="button"
            role="switch"
            aria-checked={disponible}
            onClick={() => { setDisponible((v) => !v); resetPage(); }}
            className={cn('relative h-[22px] w-10 flex-none rounded-full transition-colors', focusRing, disponible ? 'bg-brand' : 'bg-line')}
          >
            <span className={cn('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-[left]', disponible ? 'left-[22px]' : 'left-[3px]')} />
          </button>
          <span className="text-[12.5px] font-semibold text-muted">Solo disponibles</span>
        </label>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={limpiar}>Limpiar</Button>
        ) : null}
      </div>

      {/* Barra de resultados */}
      <div className="app-reveal mt-4 flex flex-wrap items-center gap-2.5" style={{ animationDelay: '80ms' }}>
        <p className="text-[14px] font-bold text-ink" aria-live="polite">
          {numero(data.total)} {data.total === 1 ? 'registro' : 'registros'}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Cambiar vista">
            <button type="button" aria-pressed={view === 'tabla'} onClick={() => setView('tabla')}
              className={cn('flex h-9 items-center gap-1.5 px-3 text-[12.5px] font-bold', focusRing, view === 'tabla' ? 'bg-brand text-brand-fg' : 'bg-surface text-muted hover:bg-surface-container')}>
              <Table2 size={15} strokeWidth={2} /> Tabla
            </button>
            <button type="button" aria-pressed={view === 'tarjetas'} onClick={() => setView('tarjetas')}
              className={cn('flex h-9 items-center gap-1.5 px-3 text-[12.5px] font-bold', focusRing, view === 'tarjetas' ? 'bg-brand text-brand-fg' : 'bg-surface text-muted hover:bg-surface-container')}>
              <LayoutGrid size={15} strokeWidth={2} /> Tarjetas
            </button>
          </div>
          <a href={`/app/biblioteca/api/export?${filterParams().toString()}`} download
            className={cn('flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12.5px] font-bold text-muted hover:bg-surface-container hover:text-ink', focusRing)}>
            Exportar
          </a>
        </div>
      </div>

      {/* Resultados */}
      <div className={cn('mt-3 transition-opacity', loading && 'opacity-50')}>
        {view === 'tabla' ? (
          <DataTableClient
            data={data.titles}
            columns={TABLE_COLUMNS}
            getRowId={(t) => t.id}
            loading={loading}
            ariaLabel="Catálogo de títulos"
            empty={
              <EmptyState
                icon={Library}
                title={data.total === 0 && !hasFilters ? 'El catálogo está vacío' : 'Sin resultados'}
                description={
                  data.total === 0 && !hasFilters
                    ? 'Registra el primer título — con el ISBN, la ficha se completa sola.'
                    : 'Prueba con otra parte del título, el autor o el ISBN, o quita filtros.'
                }
                action={
                  <Button variant="primary" onClick={() => router.push('/app/biblioteca/titulos/nuevo')}>
                    <BookPlus size={15} /> Agregar libro
                  </Button>
                }
              />
            }
            mobileCard={(t) => (
              <div className="flex items-center gap-3 p-4">
                <CoverThumb t={t} className="h-14 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[13.5px] font-bold leading-tight text-ink">{t.title}</p>
                  <p className="truncate text-[12px] text-muted">{t.authors[0] ?? '—'}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone="neutral">{KIND_META[t.kind]?.label ?? t.kind}</Badge>
                    <DisponiblesBadge t={t} />
                  </div>
                </div>
                <ActionsMenu t={t} />
              </div>
            )}
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-6">
            {data.titles.length === 0 ? (
              <Card padding="lg" className="col-span-full">
                <EmptyState icon={Library}
                  title={hasFilters ? 'Sin resultados' : 'El catálogo está vacío'}
                  description={hasFilters ? 'Quita los filtros para ver más resultados.' : 'Registra el primer título.'}
                  action={<Button variant="primary" onClick={() => router.push('/app/biblioteca/titulos/nuevo')}><BookPlus size={15} /> Agregar libro</Button>} />
              </Card>
            ) : data.titles.map((t) => <TitleCoverCard key={t.id} t={t} />)}
          </div>
        )}

        {/* Paginación */}
        {data.total > 0 ? (
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-muted">
            <span className="tabular-nums">{numero(from)}–{numero(to)} de {numero(data.total)}</span>
            {pages > 1 ? (
              <nav className="flex items-center gap-1" aria-label="Paginación">
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
        ) : null}
      </div>
    </div>
  );
}

// Vista de tarjetas — estantería de portadas.
function TitleCoverCard({ t }: { t: BiblioTitle }) {
  const { Icon } = KIND_META[t.kind] ?? KIND_META.libro;
  const libres = Math.max(0, t.itemsActive - t.itemsLoaned);
  return (
    <Link href={`/app/biblioteca/titulos/${t.id}`} className={cn('group block min-w-0 rounded-xl', focusRing)}>
      <span className="relative block aspect-[2/3] overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition-transform duration-150 group-hover:-translate-y-1 group-hover:shadow-md">
        {t.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span
            className="flex h-full w-full flex-col justify-between p-3"
            style={{ background: `linear-gradient(165deg, ${spineColor(t.title)}, ${spineColor(t.title)}cc)` }}
          >
            <Icon size={18} strokeWidth={1.8} className="text-white/70" aria-hidden="true" />
            <span className="text-[12.5px] font-bold leading-snug text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:5] overflow-hidden">
              {t.title}
            </span>
          </span>
        )}
        {t.itemsTotal === 0 ? (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/70 px-1.5 py-0.5 text-[10px] font-bold text-white">Sin ejemplares</span>
        ) : libres === 0 ? (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-danger-fg px-1.5 py-0.5 text-[10px] font-bold text-white">Agotado</span>
        ) : (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-success-fg px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">{numero(libres)} disp.</span>
        )}
      </span>
      <span className="mt-1.5 block break-words text-[12.5px] font-bold leading-tight text-ink" title={t.title}>{t.title}</span>
      <span className="block truncate text-[11px] text-muted">{t.authors[0] ?? (t.year ? String(t.year) : KIND_META[t.kind]?.label ?? '')}</span>
    </Link>
  );
}
