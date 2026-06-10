import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { getLocalBranding } from '../../lib/branding/config';
import { brandingToCssVars } from '../../lib/branding/theme';
import { ForgotForm } from '../../components/auth/ForgotForm';

// Recuperación de contraseña del staff (S1). Pública, mismo shell visual que
// /login. Anti-enumeración: el éxito muestra SIEMPRE el mismo mensaje.
export const metadata: Metadata = {
  title: 'Recuperar contraseña · Contan2',
  description: 'Recuperación de acceso al panel de administración',
};

export const dynamic = 'force-dynamic';

export default function RecuperarPage() {
  const branding = getLocalBranding();
  const themeVars = brandingToCssVars(branding) as CSSProperties;
  return (
    <div style={themeVars} className="grid min-h-screen place-items-center bg-page px-5 py-10">
      <main className="w-full max-w-[420px]">
        <div className="app-stagger">
          <header className="flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ccb-icon.svg" alt={branding.name} className="h-16 w-auto" />
            <h1 className="mt-3 text-[19px] font-semibold tracking-tight text-[#646769]">Recuperar contraseña</h1>
            <p className="mt-1 text-[13px] text-muted">Te enviamos un enlace para crear una nueva.</p>
          </header>
          <div className="mt-5 rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] sm:p-7">
            <ForgotForm />
          </div>
        </div>
      </main>
    </div>
  );
}
