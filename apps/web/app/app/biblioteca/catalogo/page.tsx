import type { Metadata } from 'next';
import { Unavailable } from '../../../../components/shell/Unavailable';
import { CatalogClient } from '../../../../components/biblioteca/CatalogClient';
import { getBiblioTitles, getBiblioSites, getBiblioFacets } from '../../../../lib/api/biblio';

// Biblioteca · Catálogo (estantería + menú de materias). El shell lo pone el
// layout de /app/biblioteca (BiblioShell).
export const metadata: Metadata = {
  title: 'Contan2 v2 · Biblioteca · Catálogo',
  description: 'Catálogo de la biblioteca: títulos y ejemplares',
};
export const dynamic = 'force-dynamic';

export default async function BibliotecaCatalogoPage() {
  const [titles, sites, facets] = [await getBiblioTitles(), await getBiblioSites(), await getBiblioFacets()];
  if (titles === null) {
    return <Unavailable inline title="Biblioteca no disponible" description="No pudimos cargar el catálogo. Reintentá en unos segundos." />;
  }
  return <CatalogClient initial={titles} sites={sites?.sites ?? []} facets={facets} />;
}
