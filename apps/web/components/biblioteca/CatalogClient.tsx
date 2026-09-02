'use client';

// components/biblioteca/CatalogClient.tsx · Catálogo de la Biblioteca (F1):
// búsqueda paginada de títulos + alta de ficha con AUTOFILL POR ISBN (D8).
// Server manda la primera página; los filtros re-fetchean vía el BFF.

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  Library, Search, Plus, X, Loader2, Check, BookOpen, Newspaper, GraduationCap, Film, FileText, ScrollText, Sparkles,
  LayoutGrid, List as ListIcon,
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

export function CatalogClient({ initial, sites, facets }: { initial: BiblioTitlesListResponse; sites: BiblioSite[]; facets: BiblioFacetsResponse | null }) {
  const [data, setData] = useState(initial);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState(false);
  // Vista de PORTADAS por defecto (estantería digital, modelo Libib) o lista.
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const p = new URLSearchParams({ page: String(page) });
        if (q.trim()) p.set('q', q.trim());
        if (kind) p.set('kind', kind);
        if (subject) p.set('subject', subject);
        const res = await fetch(`/app/biblioteca/api/titles?${p.toString()}`, { cache: 'no-store', signal: ctl.signal });
        if (res.ok) setData(await res.json() as BiblioTitlesListResponse);
      } catch { /* abort */ } finally { setLoading(false); }
    }, q ? 300 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, kind, subject, page]);

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const pickKind = (k: string) => { setKind(k); setPage(1); };
  const pickSubject = (s: string) => { setSubject(s); setPage(1); };

  return (
    <div>
      <div className="app-reveal">
        <SectionHeader
          level={1}
          title="Biblioteca · Catálogo"
          subtitle="Títulos y ejemplares del acervo. Un título es la obra; cada copia física es un ejemplar con su propio código."
          actions={<Button variant="primary" onClick={() => setDrawer(true)}><Plus size={16} strokeWidth={2.2} /> Nuevo título</Button>}
        />
      </div>

      {/* búsqueda + vista (los filtros viven en el menú lateral) */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <label className={cn('flex min-w-[280px] flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5', focusRing)}>
          <Search size={16} className="text-faint" aria-hidden="true" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Buscar por título, autor o ISBN…" aria-label="Buscar en el catálogo"
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint" />
          {loading ? <Loader2 size={15} className="animate-spin text-faint" /> : null}
        </label>
        {/* fallback móvil del menú lateral: selects compactos */}
        {facets ? (
          <div className="flex gap-2 lg:hidden">
            <select value={kind} onChange={(e) => pickKind(e.target.value)} aria-label="Filtrar por tipo"
              className={cn('min-h-10 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink', focusRing)}>
              <option value="">Todos los tipos</option>
              {facets.kinds.map((k) => <option key={k.kind} value={k.kind}>{KIND_META[k.kind]?.label ?? k.kind} ({k.count})</option>)}
            </select>
            <select value={subject} onChange={(e) => pickSubject(e.target.value)} aria-label="Filtrar por materia"
              className={cn('min-h-10 max-w-[180px] rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink', focusRing)}>
              <option value="">Todas las materias</option>
              {facets.subjects.map((s) => <option key={s.subject} value={s.subject}>{s.subject} ({s.count})</option>)}
            </select>
          </div>
        ) : null}
        <div className="ml-auto flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Cambiar vista">
          <button type="button" aria-label="Vista de portadas" aria-pressed={view === 'grid'} onClick={() => setView('grid')}
            className={cn('grid h-9 w-10 place-items-center', focusRing, view === 'grid' ? 'bg-brand text-white' : 'bg-surface text-faint hover:bg-surface-container')}>
            <LayoutGrid size={16} strokeWidth={2} />
          </button>
          <button type="button" aria-label="Vista de lista" aria-pressed={view === 'list'} onClick={() => setView('list')}
            className={cn('grid h-9 w-10 place-items-center', focusRing, view === 'list' ? 'bg-brand text-white' : 'bg-surface text-faint hover:bg-surface-container')}>
            <ListIcon size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* menú lateral (catálogos) + estantería */}
      <div className={cn('mt-4', facets && 'lg:grid lg:grid-cols-[225px_1fr] lg:items-start lg:gap-5')}>
        {facets ? (
          <CatalogSidebar facets={facets} kind={kind} subject={subject} onKind={pickKind} onSubject={pickSubject} />
        ) : null}

      <div className={cn('transition-opacity', loading && 'opacity-50')}>
        {data.titles.length === 0 ? (
          <Card padding="lg">
            <EmptyState icon={Library}
              title={data.total === 0 && !q && !kind ? 'El catálogo está vacío' : 'Sin resultados'}
              description={data.total === 0 && !q && !kind
                ? 'Registrá el primer título — con el ISBN, la ficha se completa sola.'
                : 'Probá con otra parte del título, el autor o el ISBN.'}
              action={<Button variant="primary" onClick={() => setDrawer(true)}><Plus size={15} /> Nuevo título</Button>} />
          </Card>
        ) : view === 'grid' ? (
          /* Estantería digital: muro de portadas con disponibilidad encima. */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-6">
            {data.titles.map((t) => <TitleCoverCard key={t.id} t={t} />)}
          </div>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-line/70">
              {data.titles.map((t) => <TitleRow key={t.id} t={t} />)}
            </ul>
          </Card>
        )}
        {pages > 1 ? (
          <div className="mt-3.5 flex items-center justify-between text-[12.5px] text-muted">
            <span className="tabular-nums">{data.total.toLocaleString('en-US')} títulos · página {data.page} de {pages}</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          </div>
        ) : null}
      </div>
      </div>

      <NewTitleDrawer open={drawer} onClose={() => setDrawer(false)} sitesCount={sites.length} />
    </div>
  );
}

// ── Menú lateral: los "catálogos" vivos del acervo (tipos + materias) ────────
function CatalogSidebar({ facets, kind, subject, onKind, onSubject }: {
  facets: BiblioFacetsResponse; kind: string; subject: string;
  onKind: (k: string) => void; onSubject: (s: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const subjects = showAll ? facets.subjects : facets.subjects.slice(0, 12);
  const itemCls = (active: boolean) => cn(
    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
    focusRing,
    active ? 'bg-brand/10 font-bold text-brand' : 'text-muted hover:bg-surface-container hover:text-ink',
  );
  const Count = ({ n }: { n: number }) => <span className="ml-auto text-[11px] tabular-nums text-faint">{n.toLocaleString('en-US')}</span>;

  return (
    <aside className="sticky top-20 mb-4 hidden lg:block">
      <Card padding="md">
        <button type="button" onClick={() => { onKind(''); onSubject(''); }} className={itemCls(kind === '' && subject === '')}>
          <Library size={15} strokeWidth={1.9} /> Todo el catálogo <Count n={facets.total} />
        </button>

        {facets.kinds.length > 0 ? (
          <>
            <p className="mb-1 mt-3.5 px-2.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-faint">Tipos</p>
            <div className="flex flex-col gap-0.5">
              {facets.kinds.map((k) => {
                const Icon = KIND_META[k.kind]?.Icon ?? BookOpen;
                return (
                  <button key={k.kind} type="button" onClick={() => onKind(kind === k.kind ? '' : k.kind)} className={itemCls(kind === k.kind)}>
                    <Icon size={15} strokeWidth={1.9} /> {KIND_META[k.kind]?.label ?? k.kind} <Count n={k.count} />
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {facets.subjects.length > 0 ? (
          <>
            <p className="mb-1 mt-3.5 px-2.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-faint">Materias</p>
            <div className="flex flex-col gap-0.5">
              {subjects.map((s) => (
                <button key={s.subject} type="button" onClick={() => onSubject(subject === s.subject ? '' : s.subject)} className={itemCls(subject === s.subject)}>
                  <span className="h-1.5 w-1.5 flex-none rounded-full bg-current opacity-60" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate" title={s.subject}>{s.subject}</span>
                  <Count n={s.count} />
                </button>
              ))}
            </div>
            {facets.subjects.length > 12 ? (
              <button type="button" onClick={() => setShowAll((v) => !v)}
                className={cn('mt-1.5 w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold text-brand hover:bg-surface-container', focusRing)}>
                {showAll ? 'Ver menos' : `Ver las ${facets.subjects.length} materias`}
              </button>
            ) : null}
          </>
        ) : (
          <p className="mt-3.5 px-2.5 text-[12px] leading-relaxed text-faint">Las materias que agregues a las fichas aparecerán acá como catálogos.</p>
        )}
      </Card>
    </aside>
  );
}

// Paleta de "lomos" para portadas sin imagen (determinística por título).
const SPINE_COLORS = ['#1a6194', '#7c3aed', '#0f766e', '#b45309', '#be185d', '#4d7c0f', '#1d4ed8', '#a21caf'];
function spineColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SPINE_COLORS[h % SPINE_COLORS.length]!;
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

function TitleRow({ t }: { t: BiblioTitle }) {
  const { label, Icon } = KIND_META[t.kind] ?? KIND_META.libro;
  return (
    <li>
      <Link href={`/app/biblioteca/titulos/${t.id}`} className={cn('flex items-center gap-3.5 px-4 py-3 hover:bg-surface-container/50', focusRing)}>
        <span className="grid h-11 w-9 flex-none place-items-center overflow-hidden rounded-md bg-[#e7f0f7] text-[#1a6194]">
          {t.coverUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={t.coverUrl} alt="" className="h-full w-full object-cover" />
            : <Icon size={17} strokeWidth={1.9} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold leading-tight text-ink">{t.title}{t.subtitle ? <span className="font-normal text-muted"> · {t.subtitle}</span> : null}</p>
          <p className="truncate text-[12px] text-muted">{t.authors.join(' · ') || 'Sin autor'}{t.year ? ` · ${t.year}` : ''}</p>
        </div>
        <span className="hidden flex-none text-[11px] text-faint sm:block">{label}</span>
        {t.isbn ? <span className="hidden w-36 flex-none font-mono text-[11.5px] text-faint tabular-nums md:block">{t.isbn}</span> : <span className="hidden w-36 flex-none md:block" />}
        <Chip tone={t.itemsActive > 0 ? 'success' : 'neutral'} dot>
          {t.itemsActive}/{t.itemsTotal} {t.itemsTotal === 1 ? 'ejemplar' : 'ejemplares'}
        </Chip>
      </Link>
    </li>
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
