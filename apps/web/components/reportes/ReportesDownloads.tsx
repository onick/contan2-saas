'use client';

// Un solo punto de descarga de Reportes (REP-U01/U02): SplitButton «Descargar PDF ▾» cuyo gatillo abre el panel
// «Descargas» con tres filas — Informe del período, Un ciclo o categoría, Registro mensual. Popover en ≥ lg;
// Sheet (inferior en móvil) por debajo. Los filtros de arriba (período, tipos, ciclos) gobiernan las filas 1 y 2.

import { useEffect, useId, useRef, useState } from 'react';
import { Portal as PopoverPortal } from '@radix-ui/react-popover';
import { FileText } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent, Sheet, cn, focusRing } from '../ui';
import { SplitButton } from '../ui/arc/split-button/SplitButton';
import { DEFAULT_TZ, formatRangeText, todayYmd } from '../ui/arc/date-range-picker/ymd';
import { attendanceHref, monthHref, periodHref } from './filters';
import { DownloadLink } from './DownloadLink';
import { useMediaQuery } from './useMediaQuery';
import type { Downloads } from './useDownloads';
import type { CatItem, CatStatus } from './shared';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const SELECT_CLS = cn('min-h-11 w-full rounded-field border border-border-strong bg-surface px-3 text-[14px] text-ink disabled:opacity-60 sm:min-h-10', focusRing);

export interface DownloadFilters { from: string; to: string; types: string[]; categories: string[] }

export interface DownloadsMenuProps {
  filters: DownloadFilters;
  catList: CatItem[];
  catStatus: CatStatus;
  onRetryCats: () => void;
  dl: Downloads;
}

function filtersSummary(f: DownloadFilters): string {
  const parts: string[] = [];
  if (f.types.length) parts.push(f.types.length === 1 ? '1 tipo' : `${f.types.length} tipos`);
  if (f.categories.length) parts.push(f.categories.length === 1 ? '1 ciclo' : `${f.categories.length} ciclos`);
  return parts.length ? ` · ${parts.join(' y ')}` : '';
}

export function DownloadsMenu({ filters, catList, catStatus, onRetryCats, dl }: DownloadsMenuProps) {
  const [open, setOpen] = useState(false);
  const wide = useMediaQuery('(min-width: 1024px)');
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Estado de las filas: vive acá (no en el cuerpo del panel) para sobrevivir a cerrar/abrir el panel.
  // Mes por defecto = hoy en la zona del tenant, no el reloj del navegador.
  const [cycle, setCycle] = useState(() => '');
  const [ym, setYm] = useState(() => {
    const t = todayYmd(DEFAULT_TZ);
    return { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) };
  });

  const toggle = () => {
    triggerRef.current = wrapRef.current?.querySelector<HTMLElement>('[aria-haspopup="dialog"]') ?? null;
    // Al abrir, si arriba hay UN solo ciclo marcado, la fila «Un ciclo» lo toma (REP-U02).
    if (!open && !cycle && filters.categories.length === 1) setCycle(filters.categories[0]!);
    setOpen(!open);
  };

  // Un error cierra el panel para que el aviso de la página quede a la vista (en Sheet lo tapa el fondo).
  useEffect(() => { if (dl.error) setOpen(false); }, [dl.error]);

  const f = filters;
  const periodHrefPdf = periodHref('pdf', f);

  const body = (
    <DownloadsBody
      filters={filters} catList={catList} catStatus={catStatus} onRetryCats={onRetryCats} dl={dl}
      cycle={cycle} setCycle={setCycle} ym={ym} setYm={setYm}
    />
  );

  return (
    <div ref={wrapRef}>
      <Popover open={open && wide} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="inline-flex">
            <SplitButton
              label={dl.busy === 'period-pdf' ? 'Generando…' : 'Descargar PDF'}
              href={periodHrefPdf}
              onClick={dl.linkClick('period-pdf', periodHrefPdf)}
              loading={dl.busy === 'period-pdf'}
              icon={FileText}
              actions={[]}
              menuLabel="Otros formatos de exportación"
              onMenuPress={toggle}
              menuExpanded={open}
            />
          </div>
        </PopoverAnchor>
        <PopoverPortal>
        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Descargas"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // Un clic en el propio gatillo lo gestiona toggle(); si no, cerraría y reabriría.
            if (wrapRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => { e.preventDefault(); triggerRef.current?.focus(); }}
          className="z-50 w-[min(400px,calc(100vw-24px))] rounded-card border border-line bg-surface p-4 text-ink shadow-xl"
        >
          <h2 className="text-[15px] font-bold tracking-tight text-ink">Descargas</h2>
          {body}
        </PopoverContent>
        </PopoverPortal>
      </Popover>
      <Sheet
        open={open && !wide}
        onClose={() => setOpen(false)}
        title="Descargas"
        dismissOnOverlay
        width={420}
        returnFocusRef={triggerRef}
      >
        <div className="overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-1">{body}</div>
      </Sheet>
      {/* Con el panel abierto el anuncio vive dentro del diálogo (el resto de la página queda aria-hidden). */}
      {open ? null : <p role="status" className="sr-only">{dl.done ?? ''}</p>}
    </div>
  );
}

interface BodyProps extends DownloadsMenuProps {
  cycle: string;
  setCycle: (c: string) => void;
  ym: { year: number; month: number };
  setYm: (v: { year: number; month: number }) => void;
}

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-t border-line py-4 first-of-type:border-t-0 first-of-type:pt-3 last-of-type:pb-0">
      <h3 id={id} className="text-[14px] font-semibold text-ink">{title}</h3>
      <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{hint}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function DownloadsBody({ filters, catList, catStatus, onRetryCats, dl, cycle, setCycle, ym, setYm }: BodyProps) {
  const f = filters;
  const rangeText = formatRangeText({ from: f.from, to: f.to });
  const now = todayYmd(DEFAULT_TZ);
  const curYear = Number(now.slice(0, 4)), curMonth = Number(now.slice(5, 7));
  const years = Array.from({ length: 6 }, (_, i) => curYear - i);
  // Sin meses futuros: el registro de un mes que no ocurrió saldría vacío.
  const maxMonth = ym.year === curYear ? curMonth : 12;
  const cycleId = useId(), monthId = useId(), yearId = useId();
  const cycleReady = cycle !== '';

  const cycleFilters = { from: f.from, to: f.to, types: f.types, category: cycle };

  return (
    <div>
      <p role="status" className="sr-only">{dl.done ?? ''}</p>
      <Row title="Informe del período" hint={`${rangeText}${filtersSummary(f)}. Usa los filtros de arriba.`}>
        <div className="flex gap-2">
          <DownloadLink id="period-pdf-panel" kind="PDF" scope="Informe del período" href={periodHref('pdf', f)} dl={dl} primary />
          <DownloadLink id="period-xlsx" kind="Excel" scope="Informe del período" href={periodHref('xlsx', f)} dl={dl} />
          <DownloadLink id="period-csv" kind="CSV" scope="Informe del período" href={attendanceHref('csv', f)} dl={dl} />
        </div>
      </Row>

      <Row title="Un ciclo o categoría" hint={`El detalle de un solo ciclo dentro de ${rangeText}${f.types.length ? ' y los tipos elegidos' : ''}.`}>
        <label htmlFor={cycleId} className="mb-1 block text-[13px] font-medium text-ink">Ciclo o categoría</label>
        <select id={cycleId} value={cycle} onChange={(e) => setCycle(e.target.value)} disabled={catStatus !== 'ok'} className={SELECT_CLS}>
          <option value="">{catStatus === 'loading' ? 'Cargando ciclos…' : 'Elige un ciclo'}</option>
          {catList.map((c) => (<option key={c.category} value={c.category}>{c.category} ({c.activities})</option>))}
        </select>
        {catStatus === 'error' || catStatus === 'forbidden' ? (
          <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] font-medium text-danger-fg">
            <span className="flex-1">
              {catStatus === 'forbidden' ? 'No tienes permiso para ver los ciclos.' : 'No pudimos cargar los ciclos. Esto no significa que no existan.'}
            </span>
            {catStatus === 'error' ? (
              <button type="button" onClick={onRetryCats} className={cn('min-h-9 rounded-lg border border-current px-2.5 font-bold', focusRing)}>Reintentar</button>
            ) : null}
          </div>
        ) : null}
        {catStatus === 'ok' && catList.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">Todavía no hay actividades con ciclo o categoría para agrupar.</p>
        ) : (
          <div className="mt-2.5 flex gap-2">
            <DownloadLink id="cycle-pdf" kind="PDF" scope="Un ciclo" href={attendanceHref('pdf', cycleFilters)} dl={dl} disabled={!cycleReady} primary />
            <DownloadLink id="cycle-xlsx" kind="Excel" scope="Un ciclo" href={attendanceHref('xlsx', cycleFilters)} dl={dl} disabled={!cycleReady} />
            <DownloadLink id="cycle-csv" kind="CSV" scope="Un ciclo" href={attendanceHref('csv', cycleFilters)} dl={dl} disabled={!cycleReady} />
          </div>
        )}
      </Row>

      <Row title="Registro mensual" hint="El mes completo en el formato del departamento. No usa el período de arriba.">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={monthId} className="mb-1 block text-[13px] font-medium text-ink">Mes</label>
            <select id={monthId} value={Math.min(ym.month, maxMonth)} onChange={(e) => setYm({ ...ym, month: Number(e.target.value) })} className={SELECT_CLS}>
              {MESES.slice(0, maxMonth).map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor={yearId} className="mb-1 block text-[13px] font-medium text-ink">Año</label>
            <select id={yearId} value={ym.year} onChange={(e) => {
              const year = Number(e.target.value);
              setYm({ year, month: Math.min(ym.month, year === curYear ? curMonth : 12) });
            }} className={SELECT_CLS}>
              {years.map((y) => (<option key={y} value={y}>{y}</option>))}
            </select>
          </div>
        </div>
        <div className="mt-2.5 flex">
          <DownloadLink id="month-xlsx" kind="Excel" scope="Registro mensual" href={monthHref(ym.year, Math.min(ym.month, maxMonth))} dl={dl} primary />
        </div>
      </Row>
    </div>
  );
}
