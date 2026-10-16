import type { Metadata } from 'next';
import { Unavailable } from '../../../../components/shell/Unavailable';
import { InventarioClient } from '../../../../components/biblioteca/InventarioClient';
import { getBiblioInventories, getBiblioSites } from '../../../../lib/api/biblio';

// Biblioteca · INVENTARIO (F6): sesiones de conteo físico con escaneo y
// resultado derivado. Modelo aprobado por el usuario (captura "Inventario").
export const metadata: Metadata = {
  title: 'Biblioteca · Inventario',
  description: 'Inventario físico de la biblioteca: conteo por escaneo',
};
export const dynamic = 'force-dynamic';

export default async function BibliotecaInventarioPage() {
  const [inventories, sites] = [await getBiblioInventories(), await getBiblioSites()];
  if (inventories === null) {
    return <Unavailable inline title="Biblioteca no disponible" description="No pudimos cargar el inventario. Reintentá en unos segundos." />;
  }
  return <InventarioClient initial={inventories} sites={sites?.sites ?? []} />;
}
