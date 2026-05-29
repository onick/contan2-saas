import type { BrandingOrg } from '../lib/branding/theme';

export interface BrandHeaderProps {
  branding: BrandingOrg;
}

// Header tematizado por tenant. Si hay logoUrl, muestra el logo con <img>
// nativo (este PR NO usa next/image a propósito); si no, cae al nombre de la
// organización como texto — un placeholder honesto, sin <img> roto.
export function BrandHeader({ branding }: BrandHeaderProps) {
  return (
    <header className="mb-6 md:mb-8 xl:mb-10">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
        contan2 · plataforma
      </p>

      {branding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoUrl}
          alt={branding.name}
          className="mt-1 h-10 w-auto md:h-12"
        />
      ) : (
        <h1 className="mt-1 text-2xl font-bold text-brand md:text-3xl xl:text-4xl">
          {branding.name}
        </h1>
      )}

      <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">
        Branding resuelto desde config local; el wiring a /api/v2/org/branding
        llega en un PR posterior.
      </p>
    </header>
  );
}
