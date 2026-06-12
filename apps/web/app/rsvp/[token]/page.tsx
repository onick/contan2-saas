import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { getLocalBranding } from '../../../lib/branding/config';
import { brandingToCssVars } from '../../../lib/branding/theme';
import { RsvpClient } from '../../../components/rsvp/RsvpClient';

// RSVP público (S3): el visitante responde la invitación desde su email, sin
// login. El preview/respuesta los resuelve el cliente vía /rsvp/api (tenant por
// host). Shell visual del login.
export const metadata: Metadata = {
  title: 'Invitación · Contan2',
  description: 'Confirmá tu asistencia',
};

export const dynamic = 'force-dynamic';

export default async function RsvpPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  // ?intent=yes|no viene de los botones del email: sólo PRE-ENFOCA el botón en
  // la página (el GET no responde nada — los prefetchers de correo no pueden
  // confirmar por el visitante).
  const sp = await searchParams;
  const intent = sp.intent === 'yes' || sp.intent === 'no' ? sp.intent : null;
  const branding = getLocalBranding();
  const themeVars = brandingToCssVars(branding) as CSSProperties;
  return (
    <div style={themeVars} className="grid min-h-screen place-items-center bg-page px-5 py-10">
      <main className="w-full max-w-[460px]">
        <RsvpClient token={token} orgFallback={branding.name} intent={intent} />
      </main>
    </div>
  );
}
