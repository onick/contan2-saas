'use client';

// «Actividades destacadas»: top 5 del período. Con permiso de exportar, cada fila es un botón que abre el informe de
// la actividad (Sheet con sus cifras y la descarga PDF/Excel); así el <select> de actividad ya no hace falta.

import { useEffect, useRef, useState } from 'react';
import { Film, TrendingUp, Users } from 'lucide-react';
import type { PeriodSummaryResponse } from '@contan2/contracts';
import { Card, Sheet, cn, focusRing } from '../ui';
import { DownloadLink } from './DownloadLink';
import type { Downloads } from './useDownloads';
import { PALETTE, TYPE_COLOR, TYPE_ICON, fmt } from './shared';

type Top = PeriodSummaryResponse['topActivities'][number];

export function TopActivitiesCard({ data, canExport, dl }: { data: PeriodSummaryResponse; canExport: boolean; dl: Downloads }) {
  const [selected, setSelected] = useState<Top | null>(null);
  const returnRef = useRef<HTMLElement | null>(null);
  const top = data.topActivities.slice(0, 5);
  const topMax = data.topActivities[0]?.attendances || 1;
  // Un error cierra el informe para que el aviso de la página quede a la vista (el Sheet lo taparía).
  useEffect(() => { if (dl.error) setSelected(null); }, [dl.error]);

  return (
    <Card padding="lg">
      <h2 className="text-[15.5px] font-bold tracking-tight text-ink">Actividades destacadas</h2>
      {canExport ? <p className="text-[12px] text-muted">Toca una actividad para ver su informe.</p> : null}
      <div className="mt-3">
        {top.map((a, i) => {
          const color = TYPE_COLOR[a.type] ?? PALETTE[i % PALETTE.length];
          const Ic = TYPE_ICON[a.type] ?? Film;
          const inner = (
            <>
              <span className="grid h-5 w-5 flex-none place-items-center rounded-md bg-brand/10 text-[11px] font-extrabold text-brand-text">{i + 1}</span>
              {/* miniatura: portada de la actividad o fallback al ícono del tipo */}
              <span className="grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-lg" style={{ background: `${color}1f` }}>
                {a.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={a.imageUrl} alt="" className="h-full w-full object-cover" />
                  : <Ic size={16} strokeWidth={1.9} style={{ color }} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-[13px] font-semibold leading-tight text-ink">{a.name}</p>
                <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-surface-container"><i className="block h-full rounded-full" data-bar="w" data-val={(a.attendances / topMax) * 100} style={{ width: `${(a.attendances / topMax) * 100}%`, background: color }} /></div>
              </div>
              <div className="text-right"><div className="text-[14px] font-extrabold tabular-nums text-ink" data-count={a.attendances}>{fmt(a.attendances)}</div><div className="text-[11px] text-muted">asistencias</div></div>
            </>
          );
          const rowCls = 'flex w-full items-center gap-3 border-t border-line py-2.5 first:border-t-0';
          return canExport ? (
            <button
              key={a.id} type="button"
              onClick={(e) => { returnRef.current = e.currentTarget; setSelected(a); }}
              aria-label={`Abrir informe de ${a.name}`}
              className={cn(rowCls, 'min-h-14 rounded-lg px-1 hover:bg-surface-container', focusRing)}
            >
              {inner}
            </button>
          ) : (
            <div key={a.id} className={rowCls}>{inner}</div>
          );
        })}
      </div>
      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? 'Informe de la actividad'}
        description="Cifras del período seleccionado y descarga del informe completo."
        dismissOnOverlay
        width={440}
        returnFocusRef={returnRef}
      >
        {selected ? (
          <div className="overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-2 gap-3">
              <Stat Icon={Users} tint="bg-success-bg text-success-fg" label="Asistencias" value={fmt(selected.attendances)} />
              <Stat Icon={TrendingUp} tint="bg-brand/10 text-brand-text" label="Ocupación" value={`${selected.occupancyPct}%`} />
            </div>
            <p className="mt-5 text-[13px] font-medium text-ink">Informe completo de la actividad</p>
            <p className="mt-0.5 text-[12.5px] text-muted">Resumen, asistentes y llegadas por hora.</p>
            <div className="mt-3 flex gap-2">
              <DownloadLink id={`act-pdf-${selected.id}`} kind="PDF" scope="Informe de la actividad" href={`/app/reportes/api/activity/${encodeURIComponent(selected.id)}.pdf`} dl={dl} primary />
              <DownloadLink id={`act-xlsx-${selected.id}`} kind="Excel" scope="Informe de la actividad" href={`/app/reportes/api/activity/${encodeURIComponent(selected.id)}.xlsx`} dl={dl} />
            </div>
          </div>
        ) : null}
      </Sheet>
    </Card>
  );
}

function Stat({ Icon, tint, label, value }: { Icon: typeof Users; tint: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line p-3.5">
      <span className={cn('grid h-9 w-9 flex-none place-items-center rounded-lg', tint)}><Icon size={17} strokeWidth={1.9} aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="text-[12px] text-muted">{label}</p>
        <p className="text-[22px] font-extrabold leading-tight tabular-nums text-ink">{value}</p>
      </div>
    </div>
  );
}
