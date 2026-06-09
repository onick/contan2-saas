import { ChevronRight } from 'lucide-react';
import type { RecentVisitor } from '../../lib/dashboard/demoData';
import { Card, Chip, cn, focusRing } from '../ui';

export interface RecentVisitorsProps {
  visitors: RecentVisitor[];
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// Últimos visitantes registrados · lista con avatar (iniciales), código y
// correo, y badge de visitas. DATOS DEMO ficticios (no PII real). Server
// Component.
export function RecentVisitors({ visitors }: RecentVisitorsProps) {
  return (
    <Card padding="none" className="min-w-0">
      <div className="flex items-center justify-between px-5 py-4 md:px-6">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">Últimos visitantes</h3>
          <p className="text-xs text-faint">Registrados recientemente</p>
        </div>
        <a href="/app/usuarios" className={cn('inline-flex items-center gap-1 rounded text-[13px] font-semibold text-brand', focusRing)}>
          Ver todos <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        </a>
      </div>

      <ul>
        {visitors.map((v) => (
          <li key={v.id} className="flex items-center gap-3 border-t border-line px-5 py-3 md:px-6">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary-container text-[12px] font-semibold text-on-primary-container">
              {initials(v.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium tracking-tight text-ink">{v.name}</p>
              <p className="truncate text-xs text-faint">
                <span className="tabular-nums">{v.code}</span> · {v.email}
              </p>
            </div>
            <Chip tone="neutral" className="flex-none tabular-nums">
              {v.visits} {v.visits === 1 ? 'visita' : 'visitas'}
            </Chip>
          </li>
        ))}
      </ul>
    </Card>
  );
}
