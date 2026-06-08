import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { getLocalBranding } from '../../lib/branding/config';
import { brandingToCssVars } from '../../lib/branding/theme';
import { sanitizeNext } from '../../lib/auth/session';
import { LoginForm } from '../../components/auth/LoginForm';

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
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = sanitizeNext(next);
  const branding = getLocalBranding();
  const themeVars = brandingToCssVars(branding) as CSSProperties;
  const mark = branding.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div style={themeVars} className="grid min-h-screen place-items-center bg-page px-5 py-10">
      <main className="w-full max-w-[420px]">
        {/* Entrada sutil escalonada (logo → card → pie). Desactivada bajo
            prefers-reduced-motion por globals.css; el contenido queda visible. */}
        <div className="app-stagger">
          {/* Cabecera compacta */}
          <header className="flex flex-col items-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-strong text-base font-bold text-white shadow-sm">
              {mark}
            </span>
            <h1 className="mt-3 text-[19px] font-semibold tracking-tight text-ink text-balance">
              {branding.name}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted">Panel de administración</p>
          </header>

          {/* Card */}
          <div className="mt-5 rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] sm:p-7">
            <LoginForm next={safeNext} />
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
