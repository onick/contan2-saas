import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { InvitationPreviewResponseSchema } from '@contan2/contracts';
import { resolvePublicBrandView } from '../../../lib/branding/public-brand';
import { brandingToCssVars } from '../../../lib/branding/theme';
import { getPublicBranding } from '../../../lib/api/kiosko';
import { apiGet, ApiError } from '../../../lib/api/client';
import { AcceptInviteForm } from '../../../components/auth/AcceptInviteForm';
import { BrandChip } from '../../../components/shell/BrandMark';

// Aceptación de invitación de equipo (S1). Pública; el preview se resuelve
// SERVER-side contra api-v2 (404/410 → notFound(): status HTTP 404, sin form). El shell
// visual es el de /login.
export const metadata: Metadata = {
  title: 'Invitación · Contan2',
  description: 'Súmate al equipo de la organización',
};

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = { owner: 'Propietario', admin: 'Administrador', operator: 'Operador' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
    const pub = await getPublicBranding();
  // Host sin organización → marca neutra, nunca la del CCB (Q8-65).
  const { branding, name: brandName, logoUrl } = resolvePublicBrandView(pub);
  const themeVars = brandingToCssVars(branding) as CSSProperties;

  let preview: { email: string; fullName: string | null; role: string; organization: { name: string } | null } | null = null;
  let problem: string | null = null;
  try {
    const res = await apiGet(`/api/v2/auth/invitation/${encodeURIComponent(token)}`, InvitationPreviewResponseSchema);
    preview = res.invitation;
  } catch (e) {
    // Token inexistente o invitación revocada/usada/vencida → 404 real (antes
    // era un 200 con el mensaje, Q8-71). Ver not-found.tsx. Mensaje neutro:
    // no revela en qué estado está una invitación a quien tenga el enlace.
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) notFound();
    problem = 'No pudimos cargar la invitación. Intenta de nuevo en unos minutos.';
  }

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
            <h1 className="mt-3 text-[19px] font-semibold tracking-tight text-ink">
              {preview ? `Súmate a ${preview.organization?.name ?? brandName}` : 'Invitación'}
            </h1>
            {preview ? (
              <p className="mt-1 text-[13px] text-muted">
                {preview.email} · {ROLE_LABEL[preview.role] ?? preview.role}
              </p>
            ) : null}
          </header>
          <div className="mt-5 rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-7">
            {preview ? (
              <AcceptInviteForm token={token} initialName={preview.fullName ?? ''} />
            ) : (
              <div className="flex flex-col items-center gap-2 py-3 text-center">
                <AlertTriangle size={26} strokeWidth={1.75} aria-hidden="true" className="text-danger-fg" />
                <p className="text-[13px] text-muted" role="alert">{problem}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
