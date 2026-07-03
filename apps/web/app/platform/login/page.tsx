import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getPlatformGate } from '../../../lib/auth/platform-session';
import { PlatformLoginForm } from '../../../components/platform/PlatformLoginForm';

export const metadata: Metadata = {
  title: 'contan2 · Centro de mando',
  description: 'Acceso del operador de la plataforma',
};
export const dynamic = 'force-dynamic';

export default async function PlatformLoginPage() {
  const gate = await getPlatformGate();
  if (gate.status === 'ok') redirect('/platform');

  return (
    <main className="grid min-h-screen place-items-center bg-[#0b0e13] px-4">
      <PlatformLoginForm />
    </main>
  );
}
