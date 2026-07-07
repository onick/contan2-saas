// Chip de categoría/tipo de actividad, color-codeado por tipo para distinguir
// de un vistazo (dato categórico → color justificado, no decorativo). Tintes
// suaves y de baja saturación para mantener el look premium; "Concierto" usa el
// acento naranja (coherente con v1). Categoría desconocida → gris neutro.

const CATEGORY_STYLE: Record<string, string> = {
  Cine: 'bg-[#e8f0fe] text-[#1a56b0]',
  Concierto: 'bg-[#fff3e6] text-[#b35400]',
  Tertulia: 'bg-[#e3f4f1] text-[#0f7a6b]',
  Exposición: 'bg-[#efe9fb] text-[#6b3fb8]',
  Taller: 'bg-[#fdeaf0] text-[#b03060]',
  'Visita guiada': 'bg-[#fef6e0] text-[#8a6d0f]',
  'Cuenta cuentos': 'bg-[#fde8ec] text-[#a3324b]',
  Otro: 'bg-surface-container text-muted',
};

const DEFAULT_STYLE = 'bg-surface-container text-muted';

export interface CategoryChipProps {
  category: string;
  className?: string;
}

export function CategoryChip({ category, className = '' }: CategoryChipProps) {
  const style = CATEGORY_STYLE[category] ?? DEFAULT_STYLE;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${style} ${className}`}
    >
      {category}
    </span>
  );
}
