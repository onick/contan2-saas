import type { BrandingOrg } from '../../lib/branding/theme';
import { LogoutButton } from './LogoutButton';
import { AlertTriangle, Mail } from 'lucide-react';

interface Props {
  branding: BrandingOrg;
}

export function TrialExpired({ branding }: Props) {
  return (
    <div className="grid min-h-screen place-items-center bg-page px-5 py-10">
      <main className="w-full max-w-[460px] text-center">
        <div className="app-stagger flex flex-col items-center">
          {/* Logo del tenant si existe */}
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name} className="h-14 w-auto mb-6" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand-text text-lg font-bold mb-6">
              {branding.name.slice(0, 2).toUpperCase()}
            </div>
          )}

          {/* Card */}
          <div className="w-full rounded-2xl border border-line bg-surface p-7 shadow-md sm:p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger-fg mb-4">
              <AlertTriangle size={24} strokeWidth={2} aria-hidden="true" />
            </div>

            <h1 className="text-[20px] font-semibold text-ink tracking-tight">
              Período de prueba terminado
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">
              La prueba gratuita de 14 días para <b>{branding.name}</b> ha finalizado.
              Para seguir utilizando Contan2 y administrar las visitas, check-ins y actividades de tu centro sin interrupciones, por favor activa un plan.
            </p>

            <div className="mt-6 flex flex-col gap-3 rounded-xl bg-page border border-line p-4 text-left">
              <p className="text-[13px] font-semibold text-ink">¿Cómo continuar?</p>
              <div className="flex items-start gap-2.5 text-[13px] text-muted">
                <Mail size={16} className="mt-0.5 text-brand-text flex-shrink-0" />
                <span>
                  Escríbenos a <a href="mailto:soporte@contan2.com" className="font-semibold text-ink underline hover:text-brand-text">soporte@contan2.com</a> para seleccionar un plan y activar tu panel de inmediato.
                </span>
              </div>
            </div>

            <div className="mt-6 border-t border-line pt-6 flex justify-center">
              <LogoutButton />
            </div>
          </div>

          <p className="mt-5 text-xs text-faint">
            Contan2 · Plataforma de gestión cultural.
          </p>
        </div>
      </main>
    </div>
  );
}
