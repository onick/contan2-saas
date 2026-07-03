'use client';

// components/segmentos/SegmentExportButton.tsx · descarga los miembros del
// segmento vía el BFF binario (/app/segmentos/:id/api/export → api-v2). Menú con
// formato (Excel/CSV). Cada opción es un <a download> (el navegador descarga; sin
// JS de blob). Solo se monta para owner/admin; la API igual arbitra el rol (403).

import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { Button, cn, focusRing } from '../ui';

export interface SegmentExportButtonProps {
  segmentId: string;
  total: number;
}

export function SegmentExportButton({ segmentId, total }: SegmentExportButtonProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const href = (format: string) => `/app/segmentos/${encodeURIComponent(segmentId)}/api/export?format=${format}`;
  const item = 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-ink hover:bg-surface-container';

  return (
    <div ref={wrapRef} className="relative">
      <Button type="button" variant="secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Download size={16} strokeWidth={2} aria-hidden="true" /> Exportar
        <ChevronDown size={14} strokeWidth={2.25} aria-hidden="true" className={cn('transition-transform', open && 'rotate-180')} />
      </Button>

      {open ? (
        <div role="menu" aria-label="Exportar miembros del segmento"
          className="absolute right-0 top-11 z-30 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
            {total.toLocaleString('en-US')} miembro{total === 1 ? '' : 's'}
          </p>
          <a role="menuitem" href={href('xlsx')} className={cn(item, focusRing)} onClick={() => setOpen(false)}>
            <FileSpreadsheet size={15} strokeWidth={2} aria-hidden="true" className="text-success-fg" /> Excel (.xlsx)
          </a>
          <a role="menuitem" href={href('csv')} className={cn(item, focusRing)} onClick={() => setOpen(false)}>
            <FileText size={15} strokeWidth={2} aria-hidden="true" className="text-muted" /> CSV
          </a>
        </div>
      ) : null}
    </div>
  );
}
