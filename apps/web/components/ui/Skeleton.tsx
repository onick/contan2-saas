import { cn } from './cn';

export interface SkeletonProps {
  className?: string;
}

// Placeholder de carga (fallback de Suspense en rutas dinámicas). Decorativo →
// aria-hidden. Barrido suave (.app-shimmer) sobre surface-container; bajo
// prefers-reduced-motion queda estático.
export function Skeleton({ className }: SkeletonProps) {
  return <span aria-hidden="true" className={cn('block rounded-md bg-surface-container app-shimmer', className)} />;
}
