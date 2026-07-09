'use client';

// components/puerta/PuertaExport.tsx · descarga de la data de las salas
// permanentes (Excel). El departamento de Puerta baja la actividad de SUS salas:
// ambas juntas (por defecto) o una sola (?sala=), con rango opcional. Scoped a
// las salas permanentes por el backend → nunca expone el padrón general.

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { PuertaSala } from '@contan2/contracts';
import { Card, cn, focusRing } from '../ui';

export function PuertaExport({ salas }: { salas: PuertaSala[] }) {
  const [sala, setSala] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const href = useMemo(() => {
    const p = new URLSearchParams();
    if (sala !== 'all') p.set('sala', sala);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    const qs = p.toString();
    return `/app/puerta/api/export${qs ? `?${qs}` : ''}`;
  }, [sala, from, to]);

  const inputCls = cn('mt-1 min-h-11 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink', focusRing);

  return (
    <Card padding="md" className="mt-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <h2 className="text-base font-bold tracking-tight text-ink">Descargar datos</h2>
          <p className="mt-0.5 text-[13px] text-muted">Exportá la actividad de tus salas a Excel. Elegí una sala (o «Ambas») y un rango opcional.</p>
        </div>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Sala</span>
          <select value={sala} onChange={(e) => setSala(e.target.value)} className={cn(inputCls, 'w-full')} aria-label="Sala a exportar">
            <option value="all">Ambas salas</option>
            {salas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Desde <span className="normal-case text-faint">(opcional)</span></span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Hasta <span className="normal-case text-faint">(opcional)</span></span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </label>
        <a href={href}
          className={cn('inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-[14px] font-semibold text-ink hover:bg-surface-container', focusRing)}>
          <Download size={16} strokeWidth={2.2} aria-hidden="true" /> Descargar Excel
        </a>
      </div>
    </Card>
  );
}
