import { CATEGORY_META } from '../../lib/historial/demoData';
import type { EventGroup } from '../../lib/historial/demoData';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export interface ActivityTimelineProps {
  groups: EventGroup[];
}

// Timeline de auditoría · agrupado por día, con rail vertical y nodos por
// categoría (ícono tonal). Cada evento: actor + acción + objetivo + hora.
// Server Component. Datos demo (no PII real).
export function ActivityTimeline({ groups }: ActivityTimelineProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      {groups.map((group) => (
        <section key={group.key} className="border-t border-line first:border-t-0">
          {/* Encabezado de día */}
          <div className="flex items-center gap-2 bg-page/60 px-5 py-2.5 md:px-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{group.label}</h3>
            <span className="text-[11px] tabular-nums text-faint">· {group.events.length}</span>
          </div>

          {/* Eventos con rail */}
          <ol className="relative px-5 py-2 md:px-6">
            <span aria-hidden="true" className="absolute left-[2.25rem] top-5 bottom-5 w-px bg-line md:left-[2.75rem]" />
            {group.events.map((e) => {
              const meta = CATEGORY_META[e.category];
              const Icon = meta.icon;
              return (
                <li key={e.id} className="relative flex items-start gap-3 py-2.5">
                  <span className={`z-[1] grid h-10 w-10 flex-none place-items-center rounded-full ring-4 ring-surface ${meta.iconStyle}`}>
                    <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-[14px] leading-snug text-ink">
                      <span className="font-semibold">{e.actor}</span>{' '}
                      <span className="text-muted">{e.action}</span>
                      {e.target ? <span className="font-medium text-ink"> {e.target}</span> : null}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-faint">
                      <span className="font-medium text-muted">{meta.label}</span>
                      {e.meta ? <span>· {e.meta}</span> : null}
                    </div>
                  </div>
                  <time className="flex-none whitespace-nowrap pt-1 text-[12px] tabular-nums text-faint">{e.time}</time>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
