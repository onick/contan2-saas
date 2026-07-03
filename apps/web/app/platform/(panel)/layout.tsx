import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getPlatformGate } from '../../../lib/auth/platform-session';
import { PlatformShell } from '../../../components/platform/PlatformShell';

// Gate AUTORITATIVO del panel de plataforma. El middleware ya chequeó presencia
// de cookie; acá validamos contra api-v2 (/platform/auth/me). Sesión inválida →
// /platform/login. api-v2 caído → también a login (no exponemos panel sin auth).
export const dynamic = 'force-dynamic';

export default async function PlatformPanelLayout({ children }: { children: ReactNode }) {
  const gate = await getPlatformGate();
  if (gate.status !== 'ok') redirect('/platform/login');
  return <PlatformShell admin={gate.admin}>{children}</PlatformShell>;
}
