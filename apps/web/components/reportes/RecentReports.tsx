import { Download } from 'lucide-react';
import type { RecentReport, ReportFormat } from '../../lib/reportes/demoData';
import { FORMAT_ICON } from '../../lib/reportes/demoData';

const FORMAT_STYLE: Record<ReportFormat, string> = {
  PDF: 'bg-[#fdeaea] text-[#c5221f]',
  Excel: 'bg-success-bg text-success-fg',
};

export interface RecentReportsProps {
  reports: RecentReport[];
}

// Lista de reportes recientes · estilo Google/Material. Server Component. Datos
// demo (operador genérico, sin PII).
export function RecentReports({ reports }: RecentReportsProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="px-5 py-4 md:px-6">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">Reportes recientes</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-t border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
              <th className="px-5 py-3 md:px-6">Reporte</th>
              <th className="hidden px-4 py-3 md:table-cell">Tipo</th>
              <th className="hidden px-4 py-3 lg:table-cell">Período</th>
              <th className="px-4 py-3">Generado</th>
              <th className="hidden px-4 py-3 sm:table-cell">Tamaño</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const FmtIcon = FORMAT_ICON[r.format];
              return (
                <tr key={r.id} className="border-t border-line align-middle hover:bg-page">
                  <td className="px-5 py-4 md:px-6">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-9 w-9 flex-none place-items-center rounded-lg ${FORMAT_STYLE[r.format]}`}>
                        <FmtIcon size={17} strokeWidth={1.75} aria-hidden="true" />
                      </span>
                      <span className="truncate text-sm font-medium tracking-tight text-ink">{r.name}</span>
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-[13px] text-muted md:table-cell">{r.type}</td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-[13px] text-muted lg:table-cell">{r.period}</td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <span className="block text-[13px] text-ink">{r.generated}</span>
                    <span className="block text-xs text-faint">por {r.by}</span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-[13px] tabular-nums text-muted sm:table-cell">{r.size}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-right">
                    <a href="#" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
                      <Download size={15} strokeWidth={2} aria-hidden="true" /> Descargar
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
