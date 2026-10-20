'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { Card, ActivityFeed, focusRing, cn, type ActivityFeedItem } from '../ui';
import { groupConsecutive } from '../../lib/dashboard/groupActivity';
import { RecentVisitors } from './RecentVisitors';
import { RECENT_VISITORS } from '../../lib/dashboard/demoData';

interface AuditRow {
  id: string;
  action: string;
  actorEmailMasked: string | null;
  createdAt: string;
}

type Phase = 'loading' | 'ready' | 'empty' | 'fallback' | 'forbidden';

const VISIBLE_GROUPS = 5;

const PERIOD_DAYS: Record<string, number> = {
  today: 1, '7d': 7, '30d': 30, '90d': 90,
};

interface Props {
  demoAllowed: boolean;
  period?: string;
}

export function RecentActivity({ demoAllowed, period }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [items, setItems] = useState<ActivityFeedItem[]>([]);

  useEffect(() => {
    let ignore = false;
    const days = period ? (PERIOD_DAYS[period] ?? 30) : 30;
    const from = new Date(Date.now() - days * 86_400_000).toISOString();
    const url = `/app/historial/api/audit?limit=30&from=${encodeURIComponent(from)}`;
    void fetch(url, { cache: 'no-store' })
      .then(async (r) => {
        if (ignore) return;
        if (r.status === 403) { setPhase('forbidden'); return; }
        if (!r.ok) { setPhase('fallback'); return; }
        const b = (await r.json()) as { items?: AuditRow[] };
        // Se piden más filas de las que se muestran: al agrupar repeticiones consecutivas
        // (p. ej. 4 exportaciones seguidas → "×4") siguen quedando 5 eventos distintos.
        const raw = (b.items ?? []).map((it): ActivityFeedItem => ({
          id: it.id,
          action: it.action,
          detalle: it.actorEmailMasked ?? undefined,
          at: it.createdAt,
        }));
        const list = groupConsecutive(raw).slice(0, VISIBLE_GROUPS);
        setItems(list);
        setPhase(list.length === 0 ? 'empty' : 'ready');
      })
      .catch(() => { if (!ignore) setPhase('fallback'); });
    return () => { ignore = true; };
  }, [period]);

  if (phase === 'loading') {
    return (
      <Card padding="lg" className="min-h-[180px]">
        <div className="flex items-center gap-2 text-faint" aria-busy="true">
          <Loader2 size={14} strokeWidth={2} className="animate-spin" aria-hidden="true" />
          <span className="text-[13px]">Cargando actividad…</span>
        </div>
      </Card>
    );
  }

  if (phase === 'forbidden') {
    return (
      <Card padding="lg">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">Actividad reciente</h3>
        <p className="mt-2 text-[13px] text-faint">Sin acceso al historial.</p>
      </Card>
    );
  }

  if (phase === 'fallback') {
    if (demoAllowed) return <RecentVisitors visitors={RECENT_VISITORS} />;
    return (
      <Card padding="lg">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">Actividad reciente</h3>
        <p className="mt-2 text-[13px] text-faint">No pudimos cargar la actividad.</p>
      </Card>
    );
  }

  if (phase === 'empty') {
    return (
      <Card padding="lg">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">Actividad reciente</h3>
        <p className="mt-2 text-[13px] text-faint">Sin actividad reciente todavía.</p>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[17px] font-semibold tracking-tight text-ink">Actividad reciente</h3>
        <Link
          href="/app/historial"
          className={cn('-mx-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-brand-text hover:underline', focusRing)}
        >
          Ver todo <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
      <ActivityFeed items={items} />
    </Card>
  );
}
