import { Card, Skeleton } from '@contan2/web';

// Placeholder de carga (fallback de Suspense). Dimensiones vía className.
export const Lineas = () => (
  <div className="max-w-sm space-y-2">
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-1/2" />
  </div>
);

// Composición típica: card de actividad cargando (avatar + texto + acción).
export const CardCargando = () => (
  <Card className="max-w-md">
    <div className="flex items-center gap-3">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-9 w-24 rounded-[10px]" />
    </div>
  </Card>
);
