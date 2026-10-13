import type { Metadata } from 'next';
import Link from 'next/link';
import { Library, BookOpen, PackageCheck, MapPin, ScanBarcode, Plus } from 'lucide-react';
import { SectionHeader, StatCard, ActivityFeed, Card, buttonVariants } from '../../../components/ui';
import type { ActivityFeedItem } from '../../../components/ui';
import { Unavailable } from '../../../components/shell/Unavailable';
import { PrestamosVencerCard } from '../../../components/biblioteca/PrestamosVencerCard';
import { numero } from '../../../lib/format';
import {
  getBiblioFacets, getBiblioSites, getBiblioOverview, getBiblioLoans,
} from '../../../lib/api/biblio';

export const metadata: Metadata = {
  title: 'Contan2 v2 · Biblioteca',
  description: 'Inicio de la biblioteca: resumen del acervo, préstamos y actividad reciente',
};
export const dynamic = 'force-dynamic';

export default async function BibliotecaInicioPage() {
  const [facets, sites, overview, loansResp] = await Promise.all([
    getBiblioFacets(),
    getBiblioSites(),
    getBiblioOverview(),
    getBiblioLoans('activos'),
  ]);

  if (!facets) {
    return <Unavailable inline title="Biblioteca no disponible" description="No pudimos cargar el resumen. Reintentá en unos segundos." />;
  }

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

      {/* 4 StatCards */}
      <div className="app-reveal mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ animationDelay: '40ms' }}>
        <StatCard icon={Library}     label="Títulos"          value={numero(facets.total)} />
        <StatCard icon={BookOpen}    label="Ejemplares"       value={numero(facets.items?.total ?? 0)} />
        <StatCard icon={PackageCheck} label="En buen estado"  value={numero(facets.items?.active ?? 0)} />
        <StatCard icon={MapPin}      label="Sitios físicos"   value={numero(sites?.sites.length ?? 0)} />
      </div>

      {/* Tarjetas principales */}
      <div className="app-reveal mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: '80ms' }}>
        <PrestamosVencerCard loans={prestamosVencer} />

        {activities.length > 0 ? (
          <Card padding="lg">
            <h2 className="mb-3 text-[15px] font-bold tracking-tight text-ink">Actividad reciente</h2>
            <ActivityFeed items={activities.slice(0, 6)} />
          </Card>
        ) : null}
      </div>
    </div>
  );
}
