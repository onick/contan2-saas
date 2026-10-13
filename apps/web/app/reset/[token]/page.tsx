import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { getLocalBranding } from '../../../lib/branding/config';
import { brandingToCssVars } from '../../../lib/branding/theme';
import { getPublicBranding } from '../../../lib/api/kiosko';
import { ResetForm } from '../../../components/auth/ResetForm';
import { BrandChip } from '../../../components/shell/BrandMark';

// Nueva contraseña desde el enlace de recuperación (S1). El token viaja en la
// URL (one-shot, TTL 1 h); api-v2 lo arbitra. Pública, shell visual de /login.
export const metadata: Metadata = {
  title: 'Nueva contraseña · Contan2',
  description: 'Crear una contraseña nueva',
};

export const dynamic = 'force-dynamic';

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
            <h1 className="mt-3 text-[19px] font-semibold tracking-tight text-ink">Contraseña nueva</h1>
            <p className="mt-1 text-[13px] text-muted">El enlace vence en 1 hora y se usa una sola vez.</p>
          </header>
          <div className="mt-5 rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-7">
            <ResetForm token={token} />
          </div>
        </div>
      </main>
    </div>
  );
}
