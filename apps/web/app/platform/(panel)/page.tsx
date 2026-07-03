import type { Metadata } from 'next';
import { Building2, Users, UserCog, CalendarCheck, ScanLine, AlertTriangle, ArrowRight, ChevronRight } from 'lucide-react';
import { getPlatformKpis, getPlatformTenants } from '../../../lib/api/platform-data';
import { KpiCard, DistributionBar, HealthBadge } from '../../../components/platform/atoms';
import type { TenantHealth } from '@contan2/contracts';

export const metadata: Metadata = { title: 'contan2 · Operación' };
export const dynamic = 'force-dynamic';

const DATE_FMT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const num = (v: number) => v.toLocaleString('en-US');
const AT_RISK: TenantHealth[] = ['suspendido', 'trial_vencido', 'dns_pendiente', 'sin_uso', 'inactivo'];
const SEVERITY: Record<TenantHealth, number> = { suspendido: 5, trial_vencido: 4, dns_pendiente: 3, sin_uso: 2, inactivo: 1, operando: 0 };

export default async function PlatformOperacionPage() {
  const [kpis, tenantsRes] = await Promise.all([getPlatformKpis(), getPlatformTenants()]);

  if (!kpis) {
    return (
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight text-white">Operación</h1>
        <div className="mt-6 rounded-xl border border-red-400/20 bg-red-500/[0.06] p-6 text-[13.5px] text-red-200">No pudimos cargar las métricas. Reintentá.</div>
      </div>
    );
  }

  const atRisk = (tenantsRes?.tenants ?? [])
    .filter((t) => AT_RISK.includes(t.health))
    .sort((a, b) => SEVERITY[b.health] - SEVERITY[a.health])
    .slice(0, 6);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[25px] font-semibold tracking-tight text-white">Operación</h1>
          <p className="mt-1 text-[14px] text-white/45">Vista global de la plataforma en tiempo real.</p>
        </div>
        <a href="/platform/tenants" className="inline-flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-2 text-[13px] font-semibold text-white/80 ring-1 ring-white/10 transition hover:bg-white/12">
          Ver tenants <ArrowRight size={15} aria-hidden="true" />
        </a>
      </div>

      {/* Hero: tenants + distribución */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-white/40">Tenants totales</p>
              <p className="mt-1.5 text-[40px] font-semibold leading-none tracking-tight text-white tabular-nums">{num(kpis.tenants.total)}</p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/6 text-white/50"><Building2 size={20} strokeWidth={1.9} /></span>
          </div>
          <div className="mt-5">
            <DistributionBar segments={[
              { label: 'Activos', value: kpis.tenants.active, className: 'bg-emerald-400' },
              { label: 'Suspendidos', value: kpis.tenants.suspended, className: 'bg-red-400' },
              { label: 'Trial terminado', value: kpis.tenants.trialEnded, className: 'bg-orange-400' },
            ]} />
          </div>
        </div>
        <KpiCard label="En riesgo" value={num(kpis.tenants.atRisk)} icon={AlertTriangle} accent={kpis.tenants.atRisk > 0}
          sub={kpis.tenants.atRisk > 0 ? 'Requieren atención (ver abajo)' : 'Todo en orden'} />
      </div>

      {/* Uso */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Usuarios" value={num(kpis.usersTotal)} icon={Users} />
        <KpiCard label="Staff activo" value={num(kpis.staffTotal)} icon={UserCog} />
        <KpiCard label="Actividades activas" value={num(kpis.activitiesActive)} icon={CalendarCheck} />
        <KpiCard label="Asistencias · 30d" value={num(kpis.attendances30d)} icon={ScanLine} />
      </div>

      <div className="mt-7 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Tenants en riesgo */}
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-white/40">Tenants en riesgo</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
            {atRisk.length === 0 ? (
              <p className="p-5 text-[13px] text-white/35">Ningún tenant en riesgo. 🎉</p>
            ) : (
              <ul className="divide-y divide-white/6">
                {atRisk.map((t) => (
                  <li key={t.id}>
                    <a href={`/platform/tenants/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-white/85">{t.name}</p>
                        <p className="truncate font-mono text-[11px] text-white/35">{t.slug}</p>
                      </div>
                      <HealthBadge health={t.health} />
                      <ChevronRight size={16} className="text-white/25" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Actividad reciente */}
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-white/40">Actividad reciente</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
            {kpis.recentAudit.length === 0 ? (
              <p className="p-5 text-[13px] text-white/35">Sin actividad registrada todavía.</p>
            ) : (
              <ul className="divide-y divide-white/6">
                {kpis.recentAudit.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-white/85"><span className="font-medium">{a.action}</span>{a.targetLabel ? <span className="text-white/45"> · {a.targetLabel}</span> : null}</p>
                      <p className="text-[11.5px] text-white/35">{a.tenantName ?? '—'} · {a.actorEmailMasked ?? 'sistema'}</p>
                    </div>
                    <span className="flex-none text-[11.5px] tabular-nums text-white/35">{DATE_FMT.format(new Date(a.createdAt))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
