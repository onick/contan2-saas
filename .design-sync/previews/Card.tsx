import { Button, Card, Chip, SectionHeader } from '@contan2/web';

// Superficie estándar del admin: rounded-2xl + hairline + sombra suave.
export const Basica = () => (
  <Card className="max-w-md">
    <SectionHeader
      title="Taller de cerámica"
      subtitle="Sala 2 · Hoy 4:00 p.m."
      actions={<Chip tone="success" dot>En curso</Chip>}
    />
    <p className="mt-3 text-[13px] text-muted">
      42 registrados · 28 presentes. El aforo de la sala es de 60 personas.
    </p>
  </Card>
);

// interactive: hover con sombra + lift sutil (para cards clickeables).
export const Interactiva = () => (
  <Card interactive className="max-w-md">
    <p className="text-[15px] font-semibold text-ink">Exposición Ada Balcácer</p>
    <p className="mt-1 text-[13px] text-muted">Sala permanente · Entrada libre</p>
    <div className="mt-3">
      <Button size="sm" variant="secondary">Ver detalle</Button>
    </div>
  </Card>
);

// padding="none": para media/cover a sangre; el contenido gestiona su padding.
export const SinPadding = () => (
  <Card padding="none" className="max-w-md overflow-hidden">
    <div className="grid h-28 place-items-center bg-primary-container text-[13px] font-semibold text-on-primary-container">
      Portada 16:9
    </div>
    <div className="p-5">
      <p className="text-[15px] font-semibold text-ink">Concierto de jazz</p>
      <p className="mt-1 text-[13px] text-muted">Auditorio · Viernes 8:00 p.m.</p>
    </div>
  </Card>
);
