import type { CSSProperties } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getPublicBranding } from '../../../lib/api/kiosko';
import { resolvePublicBrandView } from '../../../lib/branding/public-brand';
import { brandingToCssVars } from '../../../lib/branding/theme';
import { BrandChip } from '../../../components/shell/BrandMark';

// Invitación inválida (token inexistente, revocada, usada o vencida). Next
// responde esta página con status 404. El copy es el mismo para todos los
// casos: no confirma el estado de un token a quien solo tiene el enlace.
export default async function InviteNotFound() {
  const pub = await getPublicBranding();
  const { branding, name: brandName, logoUrl } = resolvePublicBrandView(pub);
  const themeVars = brandingToCssVars(branding) as CSSProperties;
  return (
    <div style={themeVars} className="grid min-h-screen place-items-center bg-page px-5 py-10">
      <main className="w-full max-w-[420px]">
        <header className="flex flex-col items-center text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={brandName} className="h-16 w-auto" />
          ) : (
            <BrandChip slug={branding.slug} name={brandName} className="h-16 w-16 rounded-[12px]" />
          )}
          <h1 className="mt-3 text-[19px] font-semibold tracking-tight text-ink">Invitación</h1>
        </header>
        <div className="mt-5 rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-7">
          <div className="flex flex-col items-center gap-2 py-3 text-center">
            <AlertTriangle size={26} strokeWidth={1.75} aria-hidden="true" className="text-danger-fg" />
            <p className="text-[13px] text-muted" role="alert">
              Esta invitación no es válida: el enlace no existe, ya fue usado, fue revocado o venció. Pide una nueva a quien te invitó.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
