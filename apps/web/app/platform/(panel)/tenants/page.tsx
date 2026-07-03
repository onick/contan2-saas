import type { Metadata } from 'next';
import { Building2 } from 'lucide-react';
import { getPlatformTenants } from '../../../../lib/api/platform-data';
import { HealthBadge, StatusBadge, PlanBadge } from '../../../../components/platform/atoms';
import { TenantsFilterBar } from '../../../../components/platform/TenantsFilterBar';

export const metadata: Metadata = { title: 'contan2 · Tenants' };
export const dynamic = 'force-dynamic';

const n = (v: number) => v.toLocaleString('en-US');
const DATE_FMT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

export default async function PlatformTenantsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const status = typeof sp.status === 'string' ? sp.status : '';
  const plan = typeof sp.plan === 'string' ? sp.plan : '';

  const data = await getPlatformTenants({ q, status, plan });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-white">Tenants</h1>
          <p className="mt-1 text-[14px] text-white/45">{data ? `${n(data.total)} organizaciones` : 'Organizaciones registradas'}</p>
        </div>
      </div>

      <div className="mt-5">
        <TenantsFilterBar q={q} status={status} plan={plan} />
      </div>

      {!data ? (
        <div className="mt-5 rounded-xl border border-red-400/20 bg-red-500/[0.06] p-6 text-[13.5px] text-red-200">
          No pudimos cargar los tenants. Reintentá.
        </div>
      ) : data.tenants.length === 0 ? (
        <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-12 text-center">
          <Building2 size={24} className="text-white/30" aria-hidden="true" />
          <p className="text-[14px] font-medium text-white/70">Sin resultados</p>
          <p className="text-[12.5px] text-white/40">Ajustá la búsqueda o los filtros.</p>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-white/35">
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3 text-right">Usuarios</th>
                  <th className="px-4 py-3 text-right">Staff</th>
                  <th className="px-4 py-3 text-right">Asist. 7d</th>
                  <th className="px-4 py-3 text-right">Activas</th>
                  <th className="px-4 py-3">Salud</th>
                </tr>
              </thead>
              <tbody>
                {data.tenants.map((t) => (
                  <tr key={t.id} className="border-t border-white/6 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <a href={`/platform/tenants/${t.id}`} className="block min-w-0">
                        <p className="truncate font-medium text-white/90">{t.name}</p>
                        <p className="font-mono text-[11px] text-white/35">{t.slug}{t.customDomain ? ` · ${t.customDomain}` : ''}</p>
                      </a>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3"><PlanBadge plan={t.plan} /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/75">{n(t.usersCount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/75">{n(t.staffCount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/75">{n(t.attendances7d)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/75">{n(t.activitiesActive)}</td>
                    <td className="px-4 py-3"><HealthBadge health={t.health} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
