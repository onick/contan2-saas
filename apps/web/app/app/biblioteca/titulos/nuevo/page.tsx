import type { Metadata } from 'next';
import { getAdminGate } from '../../../../../lib/auth/session';
import { getBiblioFacets, getBiblioSites } from '../../../../../lib/api/biblio';
import { NewTitleForm } from '../../../../../components/biblioteca/NewTitleForm';

// Biblioteca · NUEVO TÍTULO: página completa de catalogación (modelo aprobado
// por el usuario — reemplaza al drawer). Ficha bibliográfica por secciones,
// portada con upload real, materias/palabras clave como chips y carril derecho
// con información rápida + checklist del registro en vivo + ayuda de ISBN.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Biblioteca · Nuevo título',
  description: 'Catalogar un nuevo título en la biblioteca',
};
export const dynamic = 'force-dynamic';

export default async function BibliotecaNuevoTituloPage() {
  const [gate, facets, sites] = [await getAdminGate(), await getBiblioFacets(), await getBiblioSites()];
  const staffName = gate.status === 'ok' || gate.status === 'trial-ended' ? gate.staff.fullName : null;
  return (
    <NewTitleForm
      staffName={staffName}
      subjectSuggestions={(facets?.subjects ?? []).map((s) => s.subject)}
      sitesCount={sites?.sites.length ?? 0}
    />
  );
}
