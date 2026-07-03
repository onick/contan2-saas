import type { Metadata } from 'next';
import { ScrollText } from 'lucide-react';
import { getPlatformAudit } from '../../../../lib/api/platform-data';

export const metadata: Metadata = { title: 'contan2 · Auditoría' };
export const dynamic = 'force-dynamic';

const DATETIME = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Etiquetas legibles de las acciones del super-admin.
const ACTION_LABEL: Record<string, string> = {
  'platform.tenant.suspended': 'Suspendió tenant',
  'platform.tenant.reactivated': 'Reactivó tenant',
  'platform.tenant.plan_changed': 'Cambió plan',
  'platform.tenant.trial_updated': 'Actualizó trial',
  'platform.tenant.notes_updated': 'Actualizó notas',
};

export default async function PlatformAuditoriaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tenant = typeof sp.tenant === 'string' ? sp.tenant : '';
  const action = typeof sp.action === 'string' ? sp.action : '';

  const data = await getPlatformAudit({ tenant, action });

  return (
    <div>
      <h1 className="text-[24px] font-semibold tracking-tight text-white">Auditoría</h1>
      <p className="mt-1 text-[14px] text-white/45">Bitácora global de las acciones del operador de la plataforma.</p>

      {!data ? (
        <div className="mt-6 rounded-xl border border-red-400/20 bg-red-500/[0.06] p-6 text-[13.5px] text-red-200">No pudimos cargar la bitácora. Reintentá.</div>
      ) : data.entries.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-12 text-center">
          <ScrollText size={24} className="text-white/30" aria-hidden="true" />
          <p className="text-[14px] font-medium text-white/70">Sin registros todavía</p>
          <p className="text-[12.5px] text-white/40">Las acciones sobre tenants aparecerán acá.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-white/35">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Acción</th>
                  <th className="px-4 py-3">Actor</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id} className="border-t border-white/6">
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-white/55">{DATETIME.format(new Date(e.createdAt))}</td>
                    <td className="px-4 py-2.5 text-white/80">{e.tenantName ?? '—'}{e.tenantSlug ? <span className="text-white/35"> · {e.tenantSlug}</span> : null}</td>
                    <td className="px-4 py-2.5 text-white/85">{ACTION_LABEL[e.action] ?? e.action}{e.targetLabel && !ACTION_LABEL[e.action] ? <span className="text-white/40"> · {e.targetLabel}</span> : null}</td>
                    <td className="px-4 py-2.5 text-white/50">{e.actorEmailMasked ?? 'sistema'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.nextCursor ? (
            <div className="border-t border-white/6 px-4 py-3">
              <a href={`/platform/auditoria?${new URLSearchParams({ ...(tenant ? { tenant } : {}), ...(action ? { action } : {}), cursor: data.nextCursor }).toString()}`}
                className="text-[12.5px] font-semibold text-white/60 hover:text-white/90">Cargar más →</a>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
