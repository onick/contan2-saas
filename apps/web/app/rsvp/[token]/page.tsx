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

export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const branding = getLocalBranding();
  const themeVars = brandingToCssVars(branding) as CSSProperties;
  return (
    <div style={themeVars} className="grid min-h-screen place-items-center bg-page px-5 py-10">
      <main className="w-full max-w-[460px]">
        <RsvpClient token={token} orgFallback={branding.name} />
      </main>
    </div>
  );
}
