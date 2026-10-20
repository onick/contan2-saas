// components/ui/ActivityFeed.tsx — feed de actividad reciente (componente servidor).
// Diseño: columna "Actividad reciente" del dashboard (mockup despues-dashboard-desktop).

import type { ReactNode } from 'react';
import Link from 'next/link';
import { RelativeTime } from './RelativeTime';
import { actionMeta } from '../../lib/audit/labels';
import { cn } from './cn';

export interface ActivityFeedItem {
  id: string;
  action: string;
  sujeto?: ReactNode;
  detalle?: ReactNode;
  at: string | Date;
  // Repeticiones consecutivas agrupadas (>1 → "×N" junto a la frase).
  count?: number;
}

export interface ActivityFeedProps {
  items: ActivityFeedItem[];
  verTodoHref?: string;
  // 'default': frase + detalle en una línea y hora debajo (dashboard, equipo).
  // 'rows': chip de icono, título en una línea con el detalle debajo y la hora relativa
  // a la derecha (Inicio de Biblioteca).
  variant?: 'default' | 'rows';
  className?: string;
}

const TONE_CLS: Record<string, string> = {
  brand:   'bg-brand-soft text-brand-text',
  success: 'bg-success-bg text-success-fg',
  danger:  'bg-danger-bg text-danger-fg',
  info:    'bg-info-soft text-info-text',
  neutral: 'bg-surface-container text-muted',
};

export function ActivityFeed({ items, verTodoHref, variant = 'default', className }: ActivityFeedProps) {
  const rows = variant === 'rows';
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {verTodoHref ? (
        <div className="mb-1 flex items-center justify-between">
          <Link
            href={verTodoHref}
            className="-mx-1 inline-flex min-h-6 items-center rounded px-1 text-[12px] font-semibold text-brand-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Ver todo
          </Link>
        </div>
      ) : null}
      <ul className="min-w-0 divide-y divide-line">
        {items.map((item) => {
          const meta = actionMeta(item.action);
          const Icon = meta.icono;
          const toneCls = TONE_CLS[meta.tono] ?? TONE_CLS.neutral;
          if (rows) {
            return (
              <li key={item.id} className="flex min-w-0 items-center gap-3.5 py-3.5 first:pt-0 last:pb-0">
                <span
                  aria-hidden="true"
                  className={cn('grid h-10 w-10 flex-none place-items-center rounded-full', toneCls)}
                >
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
                    {meta.frase}
                    {item.count && item.count > 1 ? (
                      <span className="num font-semibold tabular-nums text-muted"> ×{item.count}</span>
                    ) : null}
                  </p>
                  {item.sujeto || item.detalle ? (
                    <p className="mt-0.5 text-[12.5px] leading-snug text-muted [overflow-wrap:anywhere]">
                      {item.sujeto ? <>{item.sujeto}{item.detalle ? ' · ' : ''}</> : null}
                      {item.detalle}
                    </p>
                  ) : null}
                </div>
                <RelativeTime at={item.at} className="flex-none whitespace-nowrap text-[12.5px] text-muted" />
              </li>
            );
          }
          return (
            <li key={item.id} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span
                aria-hidden="true"
                className={cn('grid h-8 w-8 flex-none place-items-center rounded-full', toneCls)}
              >
                <Icon size={15} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-ink [overflow-wrap:anywhere]">
                  {item.sujeto ? <>{item.sujeto} </> : null}
                  <span className="font-semibold">{meta.frase}</span>
                  {item.count && item.count > 1 ? (
                    <span className="num font-semibold tabular-nums text-muted"> ×{item.count}</span>
                  ) : null}
                  {item.detalle ? <> · <span className="text-muted">{item.detalle}</span></> : null}
                </p>
                <RelativeTime
                  at={item.at}
                  className="mt-0.5 text-[11.5px] text-muted"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
