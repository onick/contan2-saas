import type { BrandingOrg } from '../../lib/branding/theme';

export interface TopbarProps {
  branding: BrandingOrg;
  title: string;
  // Texto opcional del chip a la derecha (ej. período). Sin chip si se omite.
  meta?: string;
}

// Topbar · estilo Geist/Vercel: hairline inferior, fondo translúcido con blur.
// Mobile muestra el brand compacto (el Sidebar está oculto); tablet/desktop
// muestran el título de sección + un chip de contexto opcional. Sin etiquetas
// técnicas. Server Component.
export function Topbar({ branding, title, meta }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-white/80 px-5 backdrop-blur md:px-6">
      {/* Brand mobile — visible solo donde el Sidebar está oculto. */}
      <span className="truncate text-sm font-semibold tracking-tight text-brand md:hidden">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={branding.name} className="h-6 w-auto" />
        ) : (
          branding.name
        )}
      </span>

      {/* Título de sección — tablet/desktop. h2: el h1 de la vista es el
          encabezado del contenido. */}
      <h2 className="hidden text-sm font-semibold tracking-tight text-ink md:block">{title}</h2>

      {meta ? (
        <span className="rounded-full border border-line bg-white px-3 py-1 text-xs tabular-nums text-muted">
          {meta}
        </span>
      ) : (
        <span aria-hidden="true" className="md:hidden" />
      )}
    </header>
  );
}
