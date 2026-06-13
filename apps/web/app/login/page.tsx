import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { getLocalBranding } from '../../lib/branding/config';
import { brandingToCssVars } from '../../lib/branding/theme';
import { sanitizeNext } from '../../lib/auth/session';
import { headers } from 'next/headers';
import { LoginForm } from '../../components/auth/LoginForm';
import { TenantFinder } from '../../components/marketing/TenantFinder';
import { isMarketingHost } from '../../lib/marketing/host';

// Página de login del admin v2. Server Component, FUERA de /app (no la cubre el
// middleware) → accesible sin sesión. Branding local del tenant (sin red: aún no
// hay sesión para resolver branding real). `next` se sanea server-side antes de
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
  // Email pre-llenado desde el finder del marketing: solo si parece un correo.
  const defaultEmail = email && email.length <= 255 && email.includes('@') ? email : undefined;

  // HOST MARKETING (contan2.com): no hay tenant que loguear → login
  // email-first (patrón Netflix): correo → te llevamos a TU centro.
  let host: string | null = null;
  try {
    const h = await headers();
    host = h.get('x-forwarded-host') ?? h.get('host');
  } catch { /* fuera de request (tests/prerender) → rama de tenant */ }
  if (isMarketingHost(host)) {
    const rootDomain = process.env.ROOT_DOMAIN ?? 'contan2.com';
    return (
      <div className="grid min-h-screen place-items-center bg-[#faf9f7] px-5 py-10">
        <main className="flex w-full max-w-sm flex-col items-center text-center">
          <p className="text-[22px] font-semibold tracking-tight text-[#16181d]" style={{ fontFamily: 'Georgia, serif' }}>
            contan<b className="text-[#e65100]">2</b>
          </p>
          <h1 className="mt-4 text-[19px] font-semibold text-[#16181d]">Entrá a tu centro</h1>
          <p className="mt-1 text-[13.5px] text-[#6b7077]">Escribí tu correo y te llevamos al panel de tu institución.</p>
          <div className="mt-6 w-full text-left">
            <TenantFinder rootDomain={rootDomain} />
          </div>
        </main>
      </div>
    );
  }
  const branding = getLocalBranding();
  const themeVars = brandingToCssVars(branding) as CSSProperties;
  // Nombre en dos líneas: "Centro Cultural" / "Banreservas". Derivado del nombre
  // del tenant (primeras 2 palabras + resto) → para CCB da exactamente eso.
  const words = branding.name.split(/\s+/).filter(Boolean);
  const nameLine1 = words.slice(0, 2).join(' ');
  const nameLine2 = words.slice(2).join(' ');

  return (
    <div style={themeVars} className="grid min-h-screen place-items-center bg-page px-5 py-10">
      <main className="w-full max-w-[420px]">
        {/* Entrada sutil escalonada (logo → card → pie). Desactivada bajo
            prefers-reduced-motion por globals.css; el contenido queda visible. */}
        <div className="app-stagger">
          {/* Cabecera compacta · ícono real de la marca (símbolo CCB) */}
          <header className="flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ccb-icon.svg" alt={branding.name} className="h-16 w-auto" />
            <h1 className="mt-3 text-[19px] font-semibold leading-tight tracking-tight">
              <span className="block text-[#646769]">{nameLine1}</span>
              {nameLine2 ? (
                <span className="block font-light text-[#646769]">{nameLine2}</span>
              ) : null}
            </h1>
            <p className="mt-1 text-[13px] text-muted">Panel de administración</p>
          </header>

          {/* Card */}
          <div className="mt-5 rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] sm:p-7">
            <LoginForm next={safeNext} defaultEmail={defaultEmail} />
          </div>

          {/* Pie */}
          <p className="mt-5 text-center text-xs text-faint">
            Acceso restringido al equipo del centro cultural.
          </p>
        </div>
      </main>
    </div>
  );
}
