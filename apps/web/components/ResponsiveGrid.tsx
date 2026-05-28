import type { ReactNode } from 'react';

// El corazón del skeleton responsive:
//   base (mobile 375)  → 1 columna
//   md:  (tablet 768)  → 2 columnas
//   xl:  (desktop 1280)→ 3 columnas
// El gap también escala con el viewport.
export function ResponsiveGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3 xl:gap-8">
      {children}
    </div>
  );
}
