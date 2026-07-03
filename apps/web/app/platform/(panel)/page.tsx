import type { Metadata } from 'next';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { getPlatformKpis } from '../../../lib/api/platform-data';
import { KpiCard } from '../../../components/platform/atoms';

export const metadata: Metadata = { title: 'contan2 · Operación' };
export const dynamic = 'force-dynamic';

const DATE_FMT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const n = (v: number) => v.toLocaleString('en-US');

export default async function PlatformOperacionPage() {
  const kpis = await getPlatformKpis();

  if (!kpis) {
    return (
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight text-white">Operación</h1>
        <div className="mt-6 rounded-xl border border-red-400/20 bg-red-500/[0.06] p-6 text-[13.5px] text-red-200">
          No pudimos cargar las métricas. Reintentá en unos segundos.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-white">Operación</h1>
          <p className="mt-1 text-[14px] text-white/45">Vista global de la plataforma en tiempo real.</p>
        </div>
        <a href="/platform/tenants" className="inline-flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-2 text-[13px] font-semibold text-white/80 ring-1 ring-white/10 hover:bg-white/12">
          Ver tenants <ArrowRight size={15} aria-hidden="true" />
        </a>
      </div>

      {/* KPIs de tenants */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Tenants" value={n(kpis.tenants.total)} sub={`${n(kpis.tenants.active)} activos`} />
        <KpiCard label="Suspendidos" value={n(kpis.tenants.suspended)} />
        <KpiCard label="Trial terminado" value={n(kpis.tenants.trialEnded)} />
        <KpiCard label="En riesgo" value={n(kpis.tenants.atRisk)} accent={kpis.tenants.atRisk > 0}
          sub={kpis.tenants.atRisk > 0 ? 'Requieren atención' : 'Todo en orden'} />
      </div>

      {/* KPIs de uso */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Usuarios (total)" value={n(kpis.usersTotal)} />
        <KpiCard label="Staff activo" value={n(kpis.staffTotal)} />
        <KpiCard label="Actividades activas" value={n(kpis.activitiesActive)} />
        <KpiCard label="Asistencias · 30 días" value={n(kpis.attendances30d)} />
      </div>

      {/* Actividad reciente */}
      <div className="mt-7">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-white/40">Actividad reciente</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
          {kpis.recentAudit.length === 0 ? (
            <div className="flex items-center gap-2 p-5 text-[13px] text-white/35">
              <AlertTriangle size={15} aria-hidden="true" /> Sin actividad registrada todavía.
            </div>
          ) : (
            <ul className="divide-y divide-white/6">
              {kpis.recentAudit.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-white/85">
                      <span className="font-medium">{a.action}</span>
                      {a.targetLabel ? <span className="text-white/45"> · {a.targetLabel}</span> : null}
                    </p>
                    <p className="text-[11.5px] text-white/35">
                      {a.tenantName ?? '—'} · {a.actorEmailMasked ?? 'sistema'}{a.actorRole ? ` (${a.actorRole})` : ''}
                    </p>
                  </div>
                  <span className="flex-none text-[11.5px] tabular-nums text-white/35">{DATE_FMT.format(new Date(a.createdAt))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
