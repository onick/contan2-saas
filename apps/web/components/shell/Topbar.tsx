import type { BrandingOrg } from '../../lib/branding/theme';

export interface TopbarProps {
  branding: BrandingOrg;
  title: string;
}

// Topbar del shell. En mobile muestra el brand compacto (el Sidebar está
// oculto); en tablet/desktop muestra el título de la sección. Server Component:
// sin handlers ni drawer interactivo (eso llega después).
export function Topbar({ branding, title }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur md:px-6">
      {/* Brand mobile — visible solo donde el Sidebar está oculto. */}
      <span className="truncate text-base font-bold text-brand md:hidden">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={branding.name} className="h-7 w-auto" />
        ) : (
          branding.name
        )}
      </span>

      {/* Título de sección — visible en tablet/desktop. */}
      <h1 className="hidden text-lg font-semibold text-slate-900 md:block">{title}</h1>

      <span className="text-sm text-slate-400">demo</span>
    </header>
  );
}
