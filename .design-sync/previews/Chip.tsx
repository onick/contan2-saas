import { Chip } from '@contan2/web';

// Tonos de estado (status/rol/badge). Presentacional — para filtros
// interactivos usar <Button variant="pill">.
export const Tonos = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Chip tone="neutral">Borrador</Chip>
    <Chip tone="success">Activa</Chip>
    <Chip tone="danger">Cancelada</Chip>
    <Chip tone="warning">Por vencer</Chip>
    <Chip tone="brand">Protocolo</Chip>
  </div>
);

// dot: punto de estado a la izquierda (semáforo).
export const ConDot = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Chip tone="success" dot>En curso</Chip>
    <Chip tone="warning" dot>Aforo al 80%</Chip>
    <Chip tone="danger" dot>Finalizada</Chip>
    <Chip tone="neutral" dot>Programada</Chip>
  </div>
);
