import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, AlertTriangle } from 'lucide-react';
import { getPlatformTenantDetail } from '../../../../../lib/api/platform-data';
import { HealthBadge, StatusBadge, PlanBadge, KpiCard } from '../../../../../components/platform/atoms';
import { TenantActions } from '../../../../../components/platform/TenantActions';

export const metadata: Metadata = { title: 'contan2 · Tenant' };
export const dynamic = 'force-dynamic';

const ROOT = 'contan2.com';
const n = (v: number) => v.toLocaleString('en-US');
const DATE = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });
const DATETIME = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPlatformTenantDetail(id);
  if (data === 'not-found') notFound();

  if (!data) {
    return (
      <div>
        <a href="/platform/tenants" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/50 hover:text-white/80"><ArrowLeft size={15} /> Tenants</a>
        <div className="mt-5 rounded-xl border border-red-400/20 bg-red-500/[0.06] p-6 text-[13.5px] text-red-200">No pudimos cargar el tenant. Reintentá.</div>
      </div>
    );
  }

  const t = data.tenant;
  const links = [
    { label: 'Admin', href: `https://${t.slug}.${ROOT}/app` },
    { label: 'Kiosko', href: `https://${t.slug}.${ROOT}/kiosko` },
    { label: 'Scanner', href: `https://${t.slug}.${ROOT}/scanner` },
    ...(t.customDomain && t.customDomainVerified ? [{ label: 'Dominio público', href: `https://${t.customDomain}` }] : []),
  ];

  return (
    <div>
      <a href="/platform/tenants" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/50 hover:text-white/80"><ArrowLeft size={15} /> Tenants</a>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="grid h-12 w-12 place-items-center rounded-xl text-[15px] font-bold text-white ring-1 ring-white/15" style={{ backgroundColor: t.primaryColor }}>
            {t.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-white">{t.name}</h1>
            <p className="font-mono text-[12px] text-white/40">{t.slug}.{ROOT}{t.customDomain ? ` · ${t.customDomain}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={t.status} /> <PlanBadge plan={t.plan} /> <HealthBadge health={t.health} />
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/6 px-3 py-1.5 text-[12.5px] font-medium text-white/75 ring-1 ring-white/10 hover:bg-white/10">
            {l.label} <ExternalLink size={13} aria-hidden="true" />
          </a>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        {/* Columna principal */}
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiCard label="Usuarios" value={n(t.usersCount)} />
            <KpiCard label="Staff activo" value={n(t.staffCount)} />
            <KpiCard label="Actividades activas" value={n(t.activitiesActive)} />
            <KpiCard label="Asistencias · 7d" value={n(t.attendances7d)} />
            <KpiCard label="Asistencias · 30d" value={n(t.attendances30d)} />
            <KpiCard label="Última actividad" value={t.lastActivityAt ? DATE.format(new Date(t.lastActivityAt)) : '—'} />
          </div>

          {/* Info general */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 text-[13px]">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              <div><dt className="text-white/40">Creado</dt><dd className="text-white/80">{DATE.format(new Date(t.createdAt))}</dd></div>
              <div><dt className="text-white/40">Trial</dt><dd className="text-white/80">{t.trialEndsAt ? DATE.format(new Date(t.trialEndsAt)) : '—'}</dd></div>
              <div><dt className="text-white/40">Dominio custom</dt><dd className="text-white/80">{t.customDomain ? `${t.customDomain}${t.customDomainVerified ? ' ✓' : ' (sin verificar)'}` : '—'}</dd></div>
              <div><dt className="text-white/40">Colores</dt><dd className="flex items-center gap-1.5 text-white/80"><span className="inline-block h-3.5 w-3.5 rounded ring-1 ring-white/15" style={{ backgroundColor: t.primaryColor }} /><span className="inline-block h-3.5 w-3.5 rounded ring-1 ring-white/15" style={{ backgroundColor: t.secondaryColor }} /></dd></div>
            </dl>
          </div>

          {/* Riesgos */}
          {data.risks.length > 0 ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-amber-200"><AlertTriangle size={14} /> Riesgos detectados</p>
              <ul className="mt-2 space-y-1 text-[13px] text-amber-100/85">
                {data.risks.map((r, i) => <li key={i}>· {r}</li>)}
              </ul>
            </div>
          ) : null}

          {/* Staff */}
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-white/40">Staff ({data.staff.length})</h2>
            <div className="mt-2.5 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
              {data.staff.length === 0 ? (
                <p className="p-4 text-[13px] text-white/35">Sin staff.</p>
              ) : (
                <ul className="divide-y divide-white/6 text-[13px]">
                  {data.staff.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0"><p className="truncate text-white/85">{s.fullName}</p><p className="truncate text-[11.5px] text-white/40">{s.email}</p></div>
                      <span className="flex-none rounded-md bg-white/6 px-2 py-0.5 text-[11px] font-medium text-white/60">{s.role}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Actividad reciente */}
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-white/40">Actividad reciente</h2>
            <div className="mt-2.5 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
              {data.recentAudit.length === 0 ? (
                <p className="p-4 text-[13px] text-white/35">Sin actividad registrada.</p>
              ) : (
                <ul className="divide-y divide-white/6 text-[13px]">
                  {data.recentAudit.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="truncate text-white/80">{a.action}{a.targetLabel ? <span className="text-white/40"> · {a.targetLabel}</span> : null}</span>
                      <span className="flex-none text-[11.5px] tabular-nums text-white/35">{DATETIME.format(new Date(a.createdAt))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Columna de acciones */}
        <div>
          <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-white/40">Acciones</h2>
          <TenantActions id={t.id} status={t.status} plan={t.plan} trialEndsAt={t.trialEndsAt} internalNotes={t.internalNotes} />
        </div>
      </div>
    </div>
  );
}
