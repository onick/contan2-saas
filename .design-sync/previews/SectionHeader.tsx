import { Button, SectionHeader } from '@contan2/web';

// level=1: encabezado de página (h1 26/30px) con acciones a la derecha.
export const EncabezadoDePagina = () => (
  <SectionHeader
    level={1}
    title="Actividades"
    subtitle="Programación del Centro Cultural Banreservas"
    actions={
      <>
        <Button variant="secondary">Exportar</Button>
        <Button>Nueva actividad</Button>
      </>
    }
  />
);

// level=2 (default): encabezado de sección dentro de una página o Card.
export const EncabezadoDeSeccion = () => (
  <SectionHeader
    title="Asistentes registrados"
    subtitle="Últimas 24 horas · se actualiza en vivo"
    actions={<Button variant="ghost" size="sm">Ver todos</Button>}
  />
);

export const SoloTitulo = () => <SectionHeader title="Resumen del período" />;
