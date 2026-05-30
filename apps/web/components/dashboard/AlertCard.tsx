import type { DashboardAlert } from '../../lib/dashboard/demoData';

export interface AlertCardProps {
  alert: DashboardAlert;
}

// Aviso operativo · acento ámbar muy controlado (barra lateral, sin grandes
// rellenos), sin emojis ni etiquetas técnicas en pantalla. El campo `demo` del
// dato NO se muestra: la naturaleza mock se documenta en código, no en la UI.
// Server Component.
export function AlertCard({ alert }: AlertCardProps) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-amber-200/70 bg-amber-50/60 p-5 pl-6 md:p-6 md:pl-6">
      <span aria-hidden="true" className="absolute inset-y-4 left-0 w-[3px] rounded-full bg-amber-400" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700">
        Atención
      </p>
      <h3 className="mt-1.5 text-base font-semibold text-amber-900">{alert.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-amber-800">{alert.message}</p>
    </section>
  );
}
