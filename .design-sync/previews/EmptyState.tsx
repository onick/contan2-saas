import { Button, EmptyState } from '@contan2/web';
import { CalendarDays, SearchX } from 'lucide-react';

// Estado vacío que enseña la interfaz: ícono + título + descripción + CTA.
export const ConAccion = () => (
  <EmptyState
    icon={CalendarDays}
    title="Sin actividades programadas"
    description="Creá la primera actividad para que aparezca en el kiosko y en la agenda pública."
    action={<Button>Crear actividad</Button>}
  />
);

// Sin resultados de búsqueda/filtros — sin CTA.
export const SinResultados = () => (
  <EmptyState
    icon={SearchX}
    title="Sin resultados"
    description="Ningún asistente coincide con la búsqueda. Probá con otro nombre o código."
  />
);
