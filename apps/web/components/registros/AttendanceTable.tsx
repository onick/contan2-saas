import { CalendarX2 } from 'lucide-react';
import type { AttendanceRecord, AttendanceStatus } from '../../lib/registros/demoData';
import { CategoryChip } from '../CategoryChip';
import { Card, Chip, EmptyState, type ChipTone } from '../ui';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

const AVATAR_COLORS = [
  'bg-[#ffe6d2] text-[#7a3300]',
  'bg-[#e3f4f1] text-[#0f7a6b]',
  'bg-[#efe9fb] text-[#6b3fb8]',
  'bg-[#e8f0fe] text-[#1a56b0]',
  'bg-[#fdeaf0] text-[#b03060]',
];

// Estado → tono de Chip (presente=verde, registrado=naranja, no-show=neutral).
const STATUS_TONE: Record<AttendanceStatus, ChipTone> = {
  presente: 'success',
  registrado: 'warning',
  noshow: 'neutral',
};

export interface AttendanceTableProps {
  records: AttendanceRecord[];
}

// Tabla de registros de asistencia · estilo Google/Material. Server Component.
// Datos demo (no PII). En mobile se ocultan Canal y Fecha.
export function AttendanceTable({ records }: AttendanceTableProps) {
  if (records.length === 0) {
    return (
      <EmptyState
        icon={CalendarX2}
        title="Sin registros"
        description="No hay asistencias que coincidan con los filtros aplicados."
      />
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
              <th className="px-5 py-3 md:px-6">Visitante</th>
              <th className="px-4 py-3">Actividad</th>
              <th className="hidden px-4 py-3 md:table-cell">Fecha y hora</th>
              <th className="hidden px-4 py-3 lg:table-cell">Canal</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="app-stagger">
            {records.map((r, i) => {
              const avatar = AVATAR_COLORS[i % AVATAR_COLORS.length];
              return (
                <tr key={r.id} className="border-t border-line align-middle hover:bg-page">
                  <td className="px-5 py-4 md:px-6">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-10 w-10 flex-none place-items-center rounded-full text-[12px] font-semibold ${avatar}`}>
                        {initials(r.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium tracking-tight text-ink">{r.name}</p>
                        <p className="truncate text-xs tabular-nums text-faint">{r.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="truncate text-sm tracking-tight text-ink">{r.activity}</p>
                    <CategoryChip category={r.category} className="mt-0.5" />
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-[13px] tabular-nums text-muted md:table-cell">{r.datetime}</td>
                  <td className="hidden px-4 py-4 lg:table-cell">
                    <span className="inline-flex rounded-md bg-surface-container px-2.5 py-1 text-xs text-muted">{r.channel}</span>
                  </td>
                  <td className="px-4 py-4">
                    <Chip tone={STATUS_TONE[r.status]} dot>{r.statusLabel}</Chip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
