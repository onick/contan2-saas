import { cn } from './cn';

export interface SkeletonProps {
  className?: string;
}

// Placeholder pulsante para estados de carga (fallback de Suspense en rutas
// dinámicas). Decorativo → aria-hidden. Usa surface-container como tono base.
export function Skeleton({ className }: SkeletonProps) {
  return <span aria-hidden="true" className={cn('block animate-pulse rounded-md bg-surface-container', className)} />;
}
