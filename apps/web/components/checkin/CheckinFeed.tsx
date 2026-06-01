import { CheckCircle2, Radio } from 'lucide-react';
import type { CheckinEntry } from '../../lib/checkin/demoData';
import { Card, EmptyState } from '../ui';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export interface CheckinFeedProps {
  entries: CheckinEntry[];
  todayCount: string;
}

// Feed "Movimiento · EN VIVO" · últimos check-ins validados (datos demo). Cada
// fila: avatar, nombre, código + actividad, tiempo y check verde. Server
// Component (el tiempo real se cablea luego).
export function CheckinFeed({ entries, todayCount }: CheckinFeedProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Radio}
        title="Sin movimiento"
        description="Aún no se registraron check-ins. Las validaciones aparecerán acá en vivo."
      />
    );
  }

  return (
    <Card padding="none" className="min-w-0">
      <div className="flex items-center justify-between px-5 py-4 md:px-6">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">Movimiento</h3>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-success-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-success-fg" /> En vivo
          </span>
        </div>
        <span className="text-xs text-faint"><span className="font-semibold tabular-nums text-muted">{todayCount}</span> hoy</span>
      </div>

      <ul>
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 border-t border-line px-5 py-3 md:px-6">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary-container text-[12px] font-semibold text-on-primary-container">
              {initials(e.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium tracking-tight text-ink">{e.name}</p>
              <p className="truncate text-xs text-faint">
                <span className="tabular-nums">{e.code}</span> · {e.activity}
              </p>
            </div>
            <div className="flex flex-none flex-col items-end gap-0.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success-fg">
                <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" /> Validado
              </span>
              <span className="text-[11px] text-faint">{e.timeAgo}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
