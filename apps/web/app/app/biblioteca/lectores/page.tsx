import type { Metadata } from 'next';
import { Unavailable } from '../../../../components/shell/Unavailable';
import { LectoresClient } from '../../../../components/biblioteca/LectoresClient';
import { getBiblioReaders, getBiblioReadersStats } from '../../../../lib/api/biblio';

// Biblioteca · LECTORES (modelo aprobado por el usuario): KPIs + búsqueda con
// filtros + tabla del padrón con su perfil bibliotecario + panel de detalles.
// El lector ES el padrón del centro (mismo carné QR); acá solo se gestiona lo
// bibliotecario encima (tipo empleado/no empleado, cédula, suspensión).
export const metadata: Metadata = {
  title: 'Contan2 v2 · Biblioteca · Lectores',
  description: 'Lectores de la biblioteca: padrón del centro con perfil bibliotecario',
};
export const dynamic = 'force-dynamic';

export default async function BibliotecaLectoresPage() {
  const [readers, stats] = [await getBiblioReaders(), await getBiblioReadersStats()];
  if (readers === null) {
    return <Unavailable inline title="Biblioteca no disponible" description="No pudimos cargar los lectores. Reintentá en unos segundos." />;
  }
  return <LectoresClient initial={readers} initialStats={stats} />;
}
