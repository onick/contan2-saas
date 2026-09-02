import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Library, BookOpen, PackageCheck, MapPin, Plus, Search, ArrowRight,
  ArrowLeftRight, RotateCcw, Bookmark, Sparkles,
} from 'lucide-react';
import { Card, Chip, cn, focusRing } from '../../../components/ui';
import { Unavailable } from '../../../components/shell/Unavailable';
import { getBiblioTitles, getBiblioSites, getBiblioFacets } from '../../../lib/api/biblio';

// Biblioteca · INICIO (v1): accesos rápidos + KPIs del acervo + últimas
// adquisiciones con portada. Los bloques de circulación (préstamos recientes,
// vencidos, gráfico mensual) llegan con F2 y se muestran como "pronto"
// honestos. Shell: layout de /app/biblioteca (BiblioShell).
export const metadata: Metadata = {
  title: 'Contan2 v2 · Biblioteca',
  description: 'Inicio de la biblioteca: resumen del acervo y accesos rápidos',
};
export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function BibliotecaInicioPage() {
  const [facets, sites, recent] = [await getBiblioFacets(), await getBiblioSites(), await getBiblioTitles(1)];
  if (!facets) {
    return <Unavailable inline title="Biblioteca no disponible" description="No pudimos cargar el resumen. Reintentá en unos segundos." />;
  }
  const nuevos = (recent?.titles ?? []).slice(0, 8);

  const kpis = [
    { label: 'Títulos', value: facets.total, Icon: Library, tint: 'bg-brand/10 text-brand' },
    { label: 'Ejemplares', value: facets.items?.total ?? 0, Icon: BookOpen, tint: 'bg-[#e8f0fe] text-[#1a56b0]' },
    { label: 'En buen estado', value: facets.items?.active ?? 0, Icon: PackageCheck, tint: 'bg-success-bg text-success-fg' },
    { label: 'Sitios físicos', value: sites?.sites.length ?? 0, Icon: MapPin, tint: 'bg-[#f1e9fe] text-[#7c3aed]' },
  ];

  const quick = [
    { label: 'Buscar en el catálogo', href: '/app/biblioteca/catalogo', Icon: Search },
    { label: 'Nuevo título', href: '/app/biblioteca/catalogo', Icon: Plus },
  ];
  const soon = [
    { label: 'Nuevo préstamo', Icon: ArrowLeftRight },
    { label: 'Devolución', Icon: RotateCcw },
    { label: 'Nueva reserva', Icon: Bookmark },
  ];

  return (
    <div>
      <div className="app-reveal">
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink">Inicio</h1>
        <p className="mt-1 text-[14px] text-muted">Resumen del acervo y accesos rápidos de la biblioteca.</p>
      </div>

      {/* accesos rápidos */}
      <div className="app-reveal mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" style={{ animationDelay: '40ms' }}>
        {quick.map((a) => (
          <Link key={a.label} href={a.href}
            className={cn('flex flex-col items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 py-4 text-center shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md', focusRing)}>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand"><a.Icon size={20} strokeWidth={1.9} /></span>
            <span className="text-[12.5px] font-bold leading-tight text-ink">{a.label}</span>
          </Link>
        ))}
        {soon.map((a) => (
          <div key={a.label} className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line bg-surface/60 px-3 py-4 text-center" title="Llega con Circulación (F2)">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-container text-faint"><a.Icon size={20} strokeWidth={1.9} /></span>
            <span className="text-[12.5px] font-semibold leading-tight text-faint">{a.label}</span>
            <Chip tone="neutral">Pronto</Chip>
          </div>
        ))}
      </div>

      {/* KPIs del acervo */}
      <div className="app-reveal mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ animationDelay: '80ms' }}>
        {kpis.map((k) => (
          <Card key={k.label} padding="md" className="flex items-center gap-3.5">
            <span className={cn('grid h-11 w-11 flex-none place-items-center rounded-xl', k.tint)}><k.Icon size={21} strokeWidth={1.9} /></span>
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-faint">{k.label}</span>
              <span className="block text-[26px] font-extrabold leading-tight tabular-nums text-ink">{fmt(k.value)}</span>
            </span>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* nuevas adquisiciones */}
        <Card padding="lg" className="app-reveal" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Últimos títulos catalogados</h2>
            <Link href="/app/biblioteca/catalogo" className={cn('inline-flex items-center gap-1 text-[12.5px] font-bold text-brand hover:underline', focusRing)}>
              Ver catálogo <ArrowRight size={14} />
            </Link>
          </div>
          {nuevos.length === 0 ? (
            <p className="mt-4 text-[13.5px] text-muted">Todavía no hay títulos. Registrá el primero — con el ISBN, la ficha se completa sola.</p>
          ) : (
            <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
              {nuevos.map((t) => (
                <Link key={t.id} href={`/app/biblioteca/titulos/${t.id}`} className={cn('group block min-w-0 rounded-lg', focusRing)} title={t.title}>
                  <span className="block aspect-[2/3] overflow-hidden rounded-lg border border-line bg-[#1a6194] shadow-sm transition-transform group-hover:-translate-y-0.5">
                    {t.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <span className="flex h-full w-full items-end p-1.5 text-[9px] font-bold leading-tight text-white">{t.title.slice(0, 40)}</span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* qué sigue (honesto) */}
        <Card padding="lg" className="app-reveal" style={{ animationDelay: '160ms' }}>
          <h2 className="flex items-center gap-1.5 text-[15.5px] font-bold tracking-tight text-ink"><Sparkles size={15} className="text-brand" /> Próximo en la biblioteca</h2>
          <ul className="mt-3 space-y-3 text-[13px] leading-relaxed text-muted">
            <li><b className="text-ink">Circulación (F2):</b> prestar y devolver en dos escaneos, préstamos recientes y vencidos acá en el Inicio.</li>
            <li><b className="text-ink">Lectores:</b> perfil sobre el padrón — el mismo carné QR del centro.</li>
            <li><b className="text-ink">Reservas y alertas:</b> cola de espera y avisos por correo.</li>
            <li><b className="text-ink">Reportes:</b> préstamos por mes, más prestados, uso por colección.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
