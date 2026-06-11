'use client';

// Informe por ACTIVIDAD (S2): elegí una actividad → descargá el informe branded
// (Excel con hoja de asistentes + PDF con portada). El selector llega del
// server (la página ya tiene el set de actividades).

import { useState } from 'react';
import { FileBarChart2, Download } from 'lucide-react';
import { Button, Card, cn, focusRing } from '../ui';

export interface ReportableActivity { id: string; title: string; date: string }

export function ActivityReportCard({ activities }: { activities: ReportableActivity[] }) {
  const [selected, setSelected] = useState(activities[0]?.id ?? '');

  return (
    <Card padding="md" className="mt-5">
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-ink">
        <FileBarChart2 size={17} strokeWidth={2} aria-hidden="true" className="text-muted" /> Informe por actividad
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">Documento completo de una actividad: resumen, asistentes (con afinidad) y llegadas por hora.</p>

      {activities.length === 0 ? (
        <p className="mt-4 text-[13px] text-faint">Todavía no hay actividades para reportar.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Actividad</span>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}
              className={cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing)}>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.title} · {a.date}</option>)}
            </select>
          </label>
          <a href={`/app/reportes/api/activity/${encodeURIComponent(selected)}.xlsx`} className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-page', focusRing)}>
            <Download size={15} strokeWidth={2} aria-hidden="true" /> Excel
          </a>
          <a href={`/app/reportes/api/activity/${encodeURIComponent(selected)}.pdf`} className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-page', focusRing)}>
            <Download size={15} strokeWidth={2} aria-hidden="true" /> PDF
          </a>
        </div>
      )}
    </Card>
  );
}
