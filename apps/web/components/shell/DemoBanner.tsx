import { FlaskConical } from 'lucide-react';

// Aviso visible de que el fallback a datos demo está ACTIVO. Solo aparece en
// desarrollo con ALLOW_DEMO_FALLBACK explícito (isDemoFallbackAllowed); en
// staging/prod nunca se renderiza. Evita que datos demo pasen por reales.
export function DemoBanner() {
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2.5 rounded-lg border border-[#e3c98a] bg-[#fdf6e3] px-3.5 py-2.5 text-[12.5px] font-medium text-[#8a6d1a]"
    >
      <FlaskConical size={16} strokeWidth={2} aria-hidden="true" className="flex-none" />
      <span>
        <strong className="font-semibold">Datos de demostración</strong> · fallback activado
        (solo desarrollo). No representa datos reales del tenant.
      </span>
    </div>
  );
}
