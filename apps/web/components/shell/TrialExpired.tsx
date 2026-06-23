import type { BrandingOrg } from '../../lib/branding/theme';
import { LogoutButton } from './LogoutButton';
import { AlertTriangle, Mail } from 'lucide-react';

interface Props {
  branding: BrandingOrg;
}

export function TrialExpired({ branding }: Props) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#faf9f7] px-5 py-10">
      <main className="w-full max-w-[460px] text-center">
        <div className="app-stagger flex flex-col items-center">
          {/* Logo del tenant si existe */}
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name} className="h-14 w-auto mb-6" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-[#e65100] text-lg font-bold mb-6">
              {branding.name.slice(0, 2).toUpperCase()}
            </div>
          )}

          {/* Card */}
          <div className="w-full rounded-2xl border border-[#e6e3dd] bg-white p-7 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] sm:p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
              <AlertTriangle size={24} strokeWidth={2} aria-hidden="true" />
            </div>

            <h1 className="text-[20px] font-semibold text-[#16181d] tracking-tight">
              Período de prueba terminado
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-[#6b7077]">
              La prueba gratuita de 14 días para <b>{branding.name}</b> ha finalizado.
              Para seguir utilizando Contan2 y administrar las visitas, check-ins y actividades de tu centro sin interrupciones, por favor activa un plan.
            </p>

            <div className="mt-6 flex flex-col gap-3 rounded-xl bg-[#faf9f7] border border-[#e6e3dd] p-4 text-left">
              <p className="text-[13px] font-semibold text-[#16181d]">¿Cómo continuar?</p>
              <div className="flex items-start gap-2.5 text-[13px] text-[#6b7077]">
                <Mail size={16} className="mt-0.5 text-[#e65100] flex-shrink-0" />
                <span>
                  Escríbenos a <a href="mailto:soporte@contan2.com" className="font-semibold text-[#16181d] underline hover:text-[#e65100]">soporte@contan2.com</a> para seleccionar un plan y activar tu panel de inmediato.
                </span>
              </div>
            </div>

            <div className="mt-6 border-t border-[#e6e3dd] pt-6 flex justify-center">
              <LogoutButton />
            </div>
          </div>

          <p className="mt-5 text-xs text-[#9ca3af]">
            Contan2 · Plataforma de gestión cultural.
          </p>
        </div>
      </main>
    </div>
  );
}
