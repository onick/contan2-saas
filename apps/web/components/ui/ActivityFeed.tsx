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
}

export interface ActivityFeedProps {
  items: ActivityFeedItem[];
  verTodoHref?: string;
  className?: string;
}

const TONE_CLS: Record<string, string> = {
  brand:   'bg-brand-soft text-brand-text',
  success: 'bg-success-bg text-success-fg',
  danger:  'bg-danger-bg text-danger-fg',
  info:    'bg-info-soft text-info-text',
  neutral: 'bg-surface-container text-muted',
};

export function ActivityFeed({ items, verTodoHref, className }: ActivityFeedProps) {
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
