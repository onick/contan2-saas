// apps/web/components/ui/BorderBeam.tsx
// Border-beam presentacional y SERVER-SAFE: sin "use client", sin JavaScript de
// animación ni medición de DOM (a diferencia del componente de 21st.dev, que usa
// motion + offset-path y mide el contenedor en runtime). Acá el movimiento vive
// 100% en CSS (clase `.border-beam` en globals.css): un anillo de 1.5px formado
// por máscara (mask-composite: exclude) sobre un conic-gradient cuyo ángulo rota
// lento vía @property --beam-angle. Usa el token de marca var(--color-brand-accent),
// así que respeta el theming por tenant.
//
// Reglas de montaje:
//   · Se monta dentro de un contenedor `relative` (la tarjeta) que tenga
//     border-radius propio; el beam hereda ese radio (rounded-[inherit]).
//   · pointer-events-none → nunca intercepta clics.
//   · aria-hidden → decorativo, invisible para lectores de pantalla.
//   · z-[1]: encima del fondo/cover de la tarjeta pero DEBAJO del contenido
//     interactivo (que el contenedor sube a z-10) → "detrás del contenido".
//   · Bajo prefers-reduced-motion la animación se detiene y queda un borde
//     estático discreto (ver globals.css). No produce layout shift (absolute).

export interface BorderBeamProps {
  /** Clases extra opcionales (p.ej. para afinar el z-index donde se monta). */
  className?: string;
}

export function BorderBeam({ className }: BorderBeamProps) {
  return (
    <span
      aria-hidden="true"
      className={['border-beam pointer-events-none absolute inset-0 z-[1] rounded-[inherit]', className]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
