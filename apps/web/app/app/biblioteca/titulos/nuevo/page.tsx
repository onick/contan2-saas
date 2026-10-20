import type { Metadata } from 'next';
import { getAdminGate } from '../../../../../lib/auth/session';
import { getBiblioFacets, getBiblioSites } from '../../../../../lib/api/biblio';
import { BibliotecaHeader } from '../../../../../components/biblioteca/BibliotecaHeader';
import { NewTitleForm } from '../../../../../components/biblioteca/NewTitleForm';

// Biblioteca · NUEVO TÍTULO: página completa de catalogación (modelo aprobado
// por el usuario — reemplaza al drawer). Ficha bibliográfica por secciones,
// portada con upload real, materias/palabras clave como chips y carril derecho
// con información rápida + checklist del registro en vivo + ayuda de ISBN.
export const metadata: Metadata = {
  title: 'Biblioteca · Nuevo título',
  description: 'Catalogar un nuevo título en la biblioteca',
};
export const dynamic = 'force-dynamic';

// ?modo=isbn (default) | manual: el CTA del catálogo decide qué campo recibe el foco.
function initialFocusFor(modo: string | string[] | undefined): 'isbn' | 'title' {
  return modo === 'manual' ? 'title' : 'isbn';
}

export default async function BibliotecaNuevoTituloPage({ searchParams }: {
  searchParams?: Promise<{ modo?: string | string[] }>;
}) {
  const { modo } = (await searchParams) ?? {};
  const [gate, facets, sites] = [await getAdminGate(), await getBiblioFacets(), await getBiblioSites()];
  const staffName = gate.status === 'ok' || gate.status === 'trial-ended' ? gate.staff.fullName : null;
  return (
    <>
    <BibliotecaHeader as="p" className="mb-6" />
    <NewTitleForm
      staffName={staffName}
      subjectSuggestions={(facets?.subjects ?? []).map((s) => s.subject)}
      sitesCount={sites?.sites.length ?? 0}
      initialFocus={initialFocusFor(modo)}
    />
    </>
  );
}
