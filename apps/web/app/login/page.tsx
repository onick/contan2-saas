import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { getLocalBranding } from '../../lib/branding/config';
import { brandingToCssVars } from '../../lib/branding/theme';
import { getPublicBranding } from '../../lib/api/kiosko';
import { sanitizeNext } from '../../lib/auth/session';
import { headers } from 'next/headers';
import { LoginForm } from '../../components/auth/LoginForm';
import { TenantFinder } from '../../components/marketing/TenantFinder';
import { isMarketingHost } from '../../lib/marketing/host';
import { BrandChip } from '../../components/shell/BrandMark';

// Página de login del admin v2. Server Component, FUERA de /app (no la cubre el
// middleware) → accesible sin sesión. `next` se sanea server-side antes de
// pasarlo al form (solo rutas relativas bajo /app).
export const metadata: Metadata = {
  title: 'Ingresar · Contan2',
  description: 'Acceso al panel de administración',
};

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { next, email } = await searchParams;
  const safeNext = sanitizeNext(next);
  const defaultEmail = email && email.length <= 255 && email.includes('@') ? email : undefined;

  // HOST MARKETING (contan2.com): login email-first (patrón Netflix).
  let host: string | null = null;
  try {
    const h = await headers();
    host = h.get('x-forwarded-host') ?? h.get('host');
  } catch { /* fuera de request (tests/prerender) → rama de tenant */ }
  if (isMarketingHost(host)) {
    const rootDomain = process.env.ROOT_DOMAIN ?? 'contan2.com';
    return (
      <div className="grid min-h-screen place-items-center bg-page px-5 py-10">
        <main className="flex w-full max-w-sm flex-col items-center text-center">
          <p className="text-[22px] font-semibold tracking-tight text-ink" style={{ fontFamily: 'Georgia, serif' }}>
            contan<b className="text-brand-text">2</b>
          </p>
          <h1 className="mt-4 text-[19px] font-semibold text-ink">Entra a tu centro</h1>
          <p className="mt-1 text-[13.5px] text-muted">Escribe tu correo y te llevamos al panel de tu institución.</p>
          <div className="mt-6 w-full text-left">
            <TenantFinder rootDomain={rootDomain} />
          </div>
        </main>
      </div>
    );
  }

  const branding = getLocalBranding();
  const themeVars = brandingToCssVars(branding) as CSSProperties;
  // Logo/nombre real del tenant desde la API pública; cae al branding local.
  const pub = await getPublicBranding();
  const brandName = pub?.name ?? branding.name;
  const logoUrl = pub?.logoUrl ?? null;

  const words = brandName.split(/\s+/).filter(Boolean);
  const nameLine1 = words.slice(0, 2).join(' ');
  const nameLine2 = words.slice(2).join(' ');

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
            <h1 className="mt-3 text-[19px] font-semibold leading-tight tracking-tight">
              <span className="block text-muted">{nameLine1}</span>
              {nameLine2 ? (
                <span className="block font-light text-muted">{nameLine2}</span>
              ) : null}
            </h1>
            <p className="mt-1 text-[13px] text-muted">Panel de administración</p>
          </header>

          <div className="mt-5 rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-7">
            <LoginForm next={safeNext} defaultEmail={defaultEmail} />
          </div>

          <p className="mt-5 text-center text-xs text-faint">
            Acceso restringido al equipo del centro cultural.
          </p>
        </div>
      </main>
    </div>
  );
}
