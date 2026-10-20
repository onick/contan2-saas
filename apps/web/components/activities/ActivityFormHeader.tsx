import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SectionHeader, focusRing, cn } from '../ui';

// Encabezado de página de Nueva/Editar actividad (Server Component): enlace de
// vuelta, título, subtítulo y la leyenda de campos obligatorios.
export function ActivityFormHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="app-reveal mb-6">
      <Link
        href="/app/actividades"
        className={cn('mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-pill text-[13px] font-medium text-muted hover:text-ink', focusRing)}
      >
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" /> Volver a actividades
      </Link>
      <SectionHeader
        level={1}
        title={title}
        subtitle={subtitle}
        actions={<p className="self-end text-[13px] text-muted"><span aria-hidden="true">*</span> Campos obligatorios</p>}
      />
    </div>
  );
}
