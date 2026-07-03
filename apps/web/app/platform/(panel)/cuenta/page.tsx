import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getPlatformGate } from '../../../../lib/auth/platform-session';
import { AccountPanel } from '../../../../components/platform/AccountPanel';

export const metadata: Metadata = { title: 'contan2 · Mi cuenta' };
export const dynamic = 'force-dynamic';

export default async function PlatformCuentaPage() {
  const gate = await getPlatformGate();
  if (gate.status !== 'ok') redirect('/platform/login');
  return (
    <div>
      <h1 className="text-[24px] font-semibold tracking-tight text-white">Mi cuenta</h1>
      <p className="mt-1 text-[14px] text-white/45">Tu identidad, contraseña y sesiones.</p>
      <div className="mt-6">
        <AccountPanel admin={gate.admin} />
      </div>
    </div>
  );
}
