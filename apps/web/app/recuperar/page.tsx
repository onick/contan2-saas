import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { getLocalBranding } from '../../lib/branding/config';
import { brandingToCssVars } from '../../lib/branding/theme';
import { getPublicBranding } from '../../lib/api/kiosko';
import { ForgotForm } from '../../components/auth/ForgotForm';
import { BrandChip } from '../../components/shell/BrandMark';

// Recuperación de contraseña del staff (S1). Pública, mismo shell visual que
// /login. Anti-enumeración: el éxito muestra SIEMPRE el mismo mensaje.
export const metadata: Metadata = {
  title: 'Recuperar contraseña · Contan2',
  description: 'Recuperación de acceso al panel de administración',
};

export const dynamic = 'force-dynamic';

export default async function RecuperarPage() {
  const branding = getLocalBranding();
  const themeVars = brandingToCssVars(branding) as CSSProperties;
  const pub = await getPublicBranding();
  const brandName = pub?.name ?? branding.name;
  const logoUrl = pub?.logoUrl ?? null;

  return (
    <div style={themeVars} className="grid min-h-screen place-items-center bg-page px-5 py-10">
      <main className="w-full max-w-[420px]">
        <div className="app-stagger">
          <header className="flex flex-col items-center text-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={brandName} className="h-16 w-auto" />
            ) : (
              <BrandChip slug={branding.slug} name={brandName} className="h-16 w-16 rounded-[12px]" />
            )}
            <h1 className="mt-3 text-[19px] font-semibold tracking-tight text-ink">Recuperar contraseña</h1>
            <p className="mt-1 text-[13px] text-muted">Te enviamos un enlace para crear una nueva.</p>
          </header>
          <div className="mt-5 rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-7">
            <ForgotForm />
          </div>
        </div>
      </main>
    </div>
  );
}
