import type { Metadata } from 'next';
import { Unavailable } from '../../../../components/shell/Unavailable';
import { ReservasClient } from '../../../../components/biblioteca/ReservasClient';
import { getBiblioReservations, getBiblioReservationsSummary } from '../../../../lib/api/biblio';

// Biblioteca · RESERVAS (F5): cola FIFO por título con expiración. Modelo
// aprobado por el usuario (captura "Reservas").
export const metadata: Metadata = {
  title: 'Contan2 v2 · Biblioteca · Reservas',
  description: 'Reservas de la biblioteca: cola de espera y listas para retirar',
};
export const dynamic = 'force-dynamic';

export default async function BibliotecaReservasPage() {
  const [reservations, summary] = [await getBiblioReservations(), await getBiblioReservationsSummary()];
  if (reservations === null) {
    return <Unavailable inline title="Biblioteca no disponible" description="No pudimos cargar las reservas. Reintentá en unos segundos." />;
  }
  return <ReservasClient initial={reservations} initialSummary={summary} />;
}
