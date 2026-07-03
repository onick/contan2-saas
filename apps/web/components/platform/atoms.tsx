// components/platform/atoms.tsx · átomos visuales del centro de mando (tema
// oscuro). Presentacionales puros (server-safe).

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
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

export function KpiCard({ label, value, sub, accent, icon: Icon }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean; icon?: LucideIcon }) {
  return (
    <div className={`group rounded-2xl border p-4 transition ${accent ? 'border-red-400/20 bg-red-500/[0.06]' : 'border-white/8 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.04]'}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-white/40">{label}</p>
        {Icon ? <span className={`grid h-7 w-7 place-items-center rounded-lg ${accent ? 'bg-red-500/12 text-red-300' : 'bg-white/6 text-white/45'}`}><Icon size={15} strokeWidth={2} aria-hidden="true" /></span> : null}
      </div>
      <p className="mt-2 text-[27px] font-semibold leading-none tracking-tight text-white tabular-nums">{value}</p>
      {sub ? <p className="mt-1.5 text-[12px] text-white/40">{sub}</p> : null}
    </div>
  );
}

// Barra de distribución (activos / suspendidos / trial) para el hero de Operación.
export function DistributionBar({ segments }: { segments: Array<{ label: string; value: number; className: string }> }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/8">
        {segments.map((s, i) => s.value > 0 ? <span key={i} className={s.className} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} /> : null)}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-[11.5px] text-white/50">
            <span className={`h-2 w-2 rounded-full ${s.className}`} /> {s.label} <span className="font-semibold tabular-nums text-white/75">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
