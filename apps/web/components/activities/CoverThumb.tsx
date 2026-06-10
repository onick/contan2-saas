'use client';

// apps/web/components/activities/CoverThumb.tsx · imagen de portada con fallback.
// Si `src` es null o la imagen falla al cargar (onError), muestra `fallback`
// (normalmente el ícono de categoría). El contenedor/tamaño lo controla el padre.

import { useState } from 'react';

export interface CoverThumbProps {
  src: string | null;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
  // Encuadre vertical 0–100 (activities.image_pos_y); null/undefined = centro.
  posY?: number | null;
}

// objectPosition para portadas: 50% horizontal fijo, vertical según encuadre.
export function coverPosition(posY: number | null | undefined): React.CSSProperties {
  return { objectPosition: `50% ${posY ?? 50}%` };
}

export function CoverThumb({ src, alt, className, fallback, posY }: CoverThumbProps) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" onError={() => setErrored(true)} className={className} style={coverPosition(posY)} />
  );
}
