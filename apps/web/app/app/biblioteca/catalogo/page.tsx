import type { Metadata } from 'next';
import { Unavailable } from '../../../../components/shell/Unavailable';
import { CatalogClient } from '../../../../components/biblioteca/CatalogClient';
import { getBiblioTitles, getBiblioSites, getBiblioFacets } from '../../../../lib/api/biblio';

// Biblioteca · Catálogo (tabla + filtros + carril de acciones/estadísticas,
// modelo aprobado por el usuario). El shell lo pone el layout de /app/biblioteca.
// Acepta ?q= (lo manda la búsqueda global del topbar del BiblioShell).
export const metadata: Metadata = {
  title: 'Contan2 v2 · Biblioteca · Catálogo',
  description: 'Catálogo de la biblioteca: títulos y ejemplares',
};
export const dynamic = 'force-dynamic';

export default async function BibliotecaCatalogoPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim().slice(0, 120) ?? '';
  const [titles, sites, facets] = [await getBiblioTitles(1, q), await getBiblioSites(), await getBiblioFacets()];
  if (titles === null) {
    return <Unavailable inline title="Biblioteca no disponible" description="No pudimos cargar el catálogo. Reintentá en unos segundos." />;
  }
  return <CatalogClient initial={titles} initialQ={q} sites={sites?.sites ?? []} facets={facets} />;
}
