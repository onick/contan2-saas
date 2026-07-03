import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'contan2 · Operación' };
export const dynamic = 'force-dynamic';

// Fase 1: stub. Fase 2 lo reemplaza por los KPIs globales reales.
export default function PlatformOperacionPage() {
  return (
    <div>
      <h1 className="text-[24px] font-semibold tracking-tight text-white">Operación</h1>
      <p className="mt-1 text-[14px] text-white/45">Vista global de la plataforma.</p>
      <div className="mt-6 rounded-xl border border-white/8 bg-white/[0.03] p-6 text-[13.5px] text-white/40">
        Los KPIs globales y los tenants se cargan en la siguiente fase.
      </div>
    </div>
  );
}
