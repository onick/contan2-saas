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

  return (
    <div style={themeVars} className="grid min-h-screen place-items-center bg-page px-5 py-10">
      <main className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-strong text-lg font-bold text-white shadow-sm">
            {branding.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? '')
              .join('')}
          </span>
          <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-ink text-balance">
            {branding.name}
          </h1>
          <p className="mt-1 text-[13px] text-muted">Panel de administración</p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <LoginForm next={safeNext} />
        </div>

        <p className="mt-6 text-center text-xs text-faint">
          Acceso restringido al equipo del centro cultural.
        </p>
      </main>
    </div>
  );
}
