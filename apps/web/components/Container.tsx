import type { ReactNode } from 'react';

// Wrapper responsive: centra el contenido y escala el padding por breakpoint.
// max-w-7xl = 80rem = 1280px (el ancho desktop del contrato).
export function Container({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6 xl:px-8">
      {children}
    </div>
  );
}
