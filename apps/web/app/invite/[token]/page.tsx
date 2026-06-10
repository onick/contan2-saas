import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { AlertTriangle } from 'lucide-react';
import { InvitationPreviewResponseSchema } from '@contan2/contracts';
import { getLocalBranding } from '../../../lib/branding/config';
import { brandingToCssVars } from '../../../lib/branding/theme';
import { apiGet, ApiError } from '../../../lib/api/client';
import { AcceptInviteForm } from '../../../components/auth/AcceptInviteForm';

// Aceptación de invitación de equipo (S1). Pública; el preview se resuelve
// SERVER-side contra api-v2 (404/410 → estado honesto sin form). El shell
// visual es el de /login.
export const metadata: Metadata = {
  title: 'Invitación · Contan2',
  description: 'Sumate al equipo de la organización',
};

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = { owner: 'Propietario', admin: 'Administrador', operator: 'Operador' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const branding = getLocalBranding();
  const themeVars = brandingToCssVars(branding) as CSSProperties;

  let preview: { email: string; fullName: string | null; role: string; organization: { name: string } | null } | null = null;
  let problem: string | null = null;
  try {
    const res = await apiGet(`/api/v2/auth/invitation/${encodeURIComponent(token)}`, InvitationPreviewResponseSchema);
    preview = res.invitation;
  } catch (e) {
    problem = e instanceof ApiError && e.status === 410
      ? 'Esta invitación ya fue usada, revocada o expiró. Pedí una nueva a quien te invitó.'
      : 'Invitación no encontrada. Revisá el enlace o pedí una nueva.';
  }

  return (
    <div style={themeVars} className="grid min-h-screen place-items-center bg-page px-5 py-10">
      <main className="w-full max-w-[420px]">
        <div className="app-stagger">
          <header className="flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ccb-icon.svg" alt={branding.name} className="h-16 w-auto" />
            <h1 className="mt-3 text-[19px] font-semibold tracking-tight text-[#646769]">
              {preview ? `Sumate a ${preview.organization?.name ?? branding.name}` : 'Invitación'}
            </h1>
            {preview ? (
              <p className="mt-1 text-[13px] text-muted">
                {preview.email} · {ROLE_LABEL[preview.role] ?? preview.role}
              </p>
            ) : null}
          </header>
          <div className="mt-5 rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] sm:p-7">
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
