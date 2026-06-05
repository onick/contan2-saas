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
}

export function CoverThumb({ src, alt, className, fallback }: CoverThumbProps) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" onError={() => setErrored(true)} className={className} />
  );
}
