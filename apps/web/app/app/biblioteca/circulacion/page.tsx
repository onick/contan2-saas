import type { Metadata } from 'next';
import { Unavailable } from '../../../../components/shell/Unavailable';
import { CirculacionClient } from '../../../../components/biblioteca/CirculacionClient';
import { getBiblioLoans, getBiblioLoansSummary } from '../../../../lib/api/biblio';

// Biblioteca · CIRCULACIÓN (F2): prestar/devolver en dos escaneos, renovaciones,
// consulta en sala, resumen del día y alertas. Modelo aprobado por el usuario.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Biblioteca · Circulación',
  description: 'Circulación de la biblioteca: préstamos, devoluciones y renovaciones',
};
export const dynamic = 'force-dynamic';

export default async function BibliotecaCirculacionPage() {
  const [loans, summary] = [await getBiblioLoans(), await getBiblioLoansSummary()];
  if (loans === null) {
    return <Unavailable inline title="Biblioteca no disponible" description="No pudimos cargar la circulación. Reintentá en unos segundos." />;
  }
  return <CirculacionClient initial={loans} initialSummary={summary} />;
}
