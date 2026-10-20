import type { Metadata } from 'next';
import Link from 'next/link';
import { Library, BookOpen, PackageCheck, MapPin, ScanBarcode, Plus, History } from 'lucide-react';
import { SectionHeader, ActivityFeed, Card, buttonVariants } from '../../../components/ui';
import type { ActivityFeedItem } from '../../../components/ui';
import { Unavailable } from '../../../components/shell/Unavailable';
import { KpiHero } from '../../../components/dashboard/KpiHero';
import { BibliotecaTabsNav } from '../../../components/biblioteca/BibliotecaTabsNav';
import { PrestamosVencerCard } from '../../../components/biblioteca/PrestamosVencerCard';
import { numero } from '../../../lib/format';
import {
  getBiblioFacetsResult, getBiblioSites, getBiblioOverview, getBiblioLoans,
} from '../../../lib/api/biblio';

export const metadata: Metadata = {
  title: 'Biblioteca',
  description: 'Inicio de la biblioteca: resumen del acervo, préstamos y actividad reciente',
};
export const dynamic = 'force-dynamic';

export default async function BibliotecaInicioPage() {
  const [facetsResult, sites, overview, loansResp] = await Promise.all([
    getBiblioFacetsResult(),
    getBiblioSites(),
    getBiblioOverview(),
    getBiblioLoans('activos'),
  ]);

  if (!facetsResult.ok) {
    if (facetsResult.reason === 'forbidden') {
      return <Unavailable inline hideRetry title="No tienes permiso para ver Biblioteca" description="Tu rol no incluye este módulo. Si lo necesitas, pídele acceso a un administrador." />;
    }
    return <Unavailable inline title="Biblioteca no disponible" description="No pudimos cargar el resumen. Inténtalo de nuevo en unos segundos." />;
  }
  const facets = facetsResult.data;

  // Préstamos activos ordenados por vencimiento (más urgentes primero: vencidos y vence_pronto).
  const prestamosVencer = (loansResp?.loans ?? [])
    .filter((l) => l.status !== 'devuelto' && l.status !== 'en_sala')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 8);

  const activities: ActivityFeedItem[] = (overview?.activity ?? []).map((a, i) => ({
    id: `${a.action}-${i}`,
    action: a.action,
    detalle: a.label,
    at: a.at,
  }));

  return (
    <div>
      {/* Cabecera de sección */}
      <SectionHeader
        level={1}
        title="Biblioteca"
        subtitle="Catálogo, préstamos y lectores"
        actions={
          <>
            <Link href="/app/biblioteca/catalogo" className={buttonVariants({ variant: 'secondary' })}>
              <ScanBarcode size={16} strokeWidth={1.9} /> Escanear ISBN
            </Link>
            <Link href="/app/biblioteca/circulacion" className={buttonVariants({ variant: 'primary' })}>
              <Plus size={16} strokeWidth={2.2} /> Nuevo préstamo
            </Link>
          </>
        }
        className="app-reveal"
      />

      <BibliotecaTabsNav />

      {/* Fila de 4 KPI (misma familia visual que Check-in y Actividades) */}
      <div className="app-reveal mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" style={{ animationDelay: '40ms' }}>
        <KpiHero
          compact tone="dark" label="Títulos" icon={Library} iconPlacement="corner"
          value={numero(facets.total)}
          footer={<p className="text-[12px] text-accent-strong-fg/80">En el catálogo</p>}
        />
        <KpiHero
          compact tone="warm" label="Ejemplares" icon={BookOpen} iconPlacement="corner"
          value={numero(facets.items?.total ?? 0)}
          footer={<p className="text-[12px] text-muted">Colección física</p>}
        />
        <KpiHero
          compact tone="neutral" label="En buen estado" icon={PackageCheck} iconPlacement="corner"
          value={numero(facets.items?.active ?? 0)}
          footer={<p className="text-[12px] text-muted">Ejemplares</p>}
        />
        <KpiHero
          compact tone="neutral" label="Sitios físicos" icon={MapPin} iconPlacement="corner"
          value={numero(sites?.sites.length ?? 0)}
          footer={<p className="text-[12px] text-muted">Ubicaciones</p>}
        />
      </div>

      {/* Tarjetas principales */}
      <div className="app-reveal mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: '80ms' }}>
        <PrestamosVencerCard loans={prestamosVencer} serverNow={Date.now()} />

        <Card padding="lg">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-bold tracking-tight text-ink">Actividad reciente</h2>
            <History size={20} strokeWidth={1.5} aria-hidden="true" className="flex-none text-faint" />
          </div>
          {activities.length > 0 ? (
            <div className="mt-4">
              <ActivityFeed variant="rows" items={activities.slice(0, 6)} />
            </div>
          ) : (
            <p className="py-10 text-center text-[13.5px] text-muted">Sin actividad reciente.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
