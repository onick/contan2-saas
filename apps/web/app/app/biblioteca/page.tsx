import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '../../../components/shell/AppShell';
import { Unavailable } from '../../../components/shell/Unavailable';
import { CatalogClient } from '../../../components/biblioteca/CatalogClient';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { getBiblioTitles, getBiblioSites, getBiblioFacets } from '../../../lib/api/biblio';
import { BIBLIOTECA_ENABLED } from '../../../lib/shell/nav';

// Biblioteca · Catálogo (F1). Plan docs/plan-modulo-biblioteca.md.
// Oculta salvo donde NEXT_PUBLIC_BIBLIOTECA_ENABLED=1 (staging) — patrón Puerta.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Biblioteca',
  description: 'Catálogo de la biblioteca: títulos y ejemplares',
};
export const dynamic = 'force-dynamic';

export default async function BibliotecaPage() {
  if (!BIBLIOTECA_ENABLED) notFound();
  const branding = await getTenantBranding();
  const [titles, sites, facets] = [await getBiblioTitles(), await getBiblioSites(), await getBiblioFacets()];

  return (
    <AppShell branding={branding} title="Biblioteca" activeKey="biblioteca">
      <div className="mx-auto w-full max-w-[1500px]">
        {titles === null ? (
          <Unavailable inline title="Biblioteca no disponible" description="No pudimos cargar el catálogo. Reintentá en unos segundos." />
        ) : (
          <CatalogClient initial={titles} sites={sites?.sites ?? []} facets={facets} />
        )}
      </div>
    </AppShell>
  );
}
