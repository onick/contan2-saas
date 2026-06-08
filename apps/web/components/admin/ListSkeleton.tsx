import { Card, Skeleton } from '../ui';

// Skeleton de un list-view (cabecera + barra de filtros + filas). Lo usan los
// loading.tsx de /usuarios y /registros durante la navegación RSC inicial.
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-44" />
          <Skeleton className="mt-2 h-3.5 w-56" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <Card padding="none" className="mt-6 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-72 rounded-full" />
          <Skeleton className="ml-auto h-9 w-40 rounded-lg" />
        </div>
      </Card>
      <Card padding="none" className="mt-4 overflow-hidden">
        <div className="px-5 py-4 md:px-6">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-line py-4 first:border-t-0">
              <Skeleton className="h-10 w-10 flex-none rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="mt-1.5 h-3 w-28" />
              </div>
              <Skeleton className="ml-auto hidden h-6 w-20 rounded-full sm:block" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
