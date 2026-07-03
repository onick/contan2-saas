// components/platform/atoms.tsx · átomos visuales del centro de mando (tema
// oscuro). Presentacionales puros (server-safe).

import type { ReactNode } from 'react';
import type { TenantHealth } from '@contan2/contracts';

const HEALTH: Record<TenantHealth, { label: string; cls: string; dot: string }> = {
  operando: { label: 'Operando', cls: 'bg-emerald-500/12 text-emerald-300 ring-emerald-400/20', dot: 'bg-emerald-400' },
  sin_uso: { label: 'Sin uso', cls: 'bg-amber-500/12 text-amber-200 ring-amber-400/20', dot: 'bg-amber-400' },
  inactivo: { label: 'Inactivo', cls: 'bg-white/8 text-white/45 ring-white/10', dot: 'bg-white/40' },
  trial_vencido: { label: 'Trial vencido', cls: 'bg-orange-500/12 text-orange-200 ring-orange-400/20', dot: 'bg-orange-400' },
  dns_pendiente: { label: 'DNS pendiente', cls: 'bg-sky-500/12 text-sky-200 ring-sky-400/20', dot: 'bg-sky-400' },
  suspendido: { label: 'Suspendido', cls: 'bg-red-500/12 text-red-300 ring-red-400/20', dot: 'bg-red-400' },
};

export function HealthBadge({ health }: { health: TenantHealth }) {
  const h = HEALTH[health];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ${h.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${h.dot}`} /> {h.label}
    </span>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Activo', cls: 'bg-emerald-500/12 text-emerald-300 ring-emerald-400/20' },
  suspended: { label: 'Suspendido', cls: 'bg-red-500/12 text-red-300 ring-red-400/20' },
  trial_ended: { label: 'Trial terminado', cls: 'bg-orange-500/12 text-orange-200 ring-orange-400/20' },
  deleted: { label: 'Eliminado', cls: 'bg-white/8 text-white/40 ring-white/10' },
};
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: 'bg-white/8 text-white/50 ring-white/10' };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ${s.cls}`}>{s.label}</span>;
}

const PLAN: Record<string, string> = { free: 'Free', pro: 'Pro', enterprise: 'Enterprise' };
export function PlanBadge({ plan }: { plan: string }) {
  return <span className="inline-flex rounded-md bg-white/8 px-2 py-0.5 text-[11.5px] font-medium text-white/70 ring-1 ring-white/10">{PLAN[plan] ?? plan}</span>;
}

export function KpiCard({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'border-red-400/20 bg-red-500/[0.06]' : 'border-white/8 bg-white/[0.03]'}`}>
      <p className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-white/40">{label}</p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-white tabular-nums">{value}</p>
      {sub ? <p className="mt-1.5 text-[12px] text-white/40">{sub}</p> : null}
    </div>
  );
}
