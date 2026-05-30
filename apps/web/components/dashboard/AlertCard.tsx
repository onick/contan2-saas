import type { DashboardAlert } from '../../lib/dashboard/demoData';

export interface AlertCardProps {
  alert: DashboardAlert;
}

// Alerta operativa (estilo ámbar). Escenario mock: si alert.demo, lo etiqueta
// explícitamente para no confundir con un dato real. Server Component.
export function AlertCard({ alert }: AlertCardProps) {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm md:p-6">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-amber-500">
          ⚠
        </span>
        <p className="text-sm font-medium uppercase tracking-wide text-amber-700">Atención</p>
        {alert.demo ? (
          <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-800">
            demo
          </span>
        ) : null}
      </div>
      <h3 className="mt-1 text-lg font-semibold text-amber-900">{alert.title}</h3>
      <p className="mt-2 text-sm text-amber-800">{alert.message}</p>
    </section>
  );
}
