'use client';

// components/usuarios/ExportButton.tsx · Usuarios PR-E2. Descarga el padrón
// vía el BFF binario (/app/usuarios/api/export → api-v2 /users/export). Menú
// con formato (Excel/CSV) × alcance:
//   · Vista actual → scope=view + los filtros vigentes (cohorte/estado/búsqueda).
//   · Todo el padrón → scope=all (respeta sólo el estado; ignora cohorte/búsqueda).
// Cada opción es un <a download> (el navegador descarga; sin JS de blob). Los
// params llegan del server (sin useSearchParams → sin hydration mismatch). Sólo
// se monta para owner/admin; la API igual arbitra el rol (403).

import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { Button, cn, focusRing } from '../ui';

export interface ExportButtonProps {
  cohort: string;   // 'all' | cohorte vigente
  status: string;   // 'active' | 'archived' | 'all'
  q: string;        // término de búsqueda vigente (puede ser '')
  filteredTotal: number; // total que coincide con la vista actual
}

function href(params: Record<string, string>): string {
  const qs = new URLSearchParams(params);
  return `/app/usuarios/api/export?${qs.toString()}`;
}

export function ExportButton({ cohort, status, q, filteredTotal }: ExportButtonProps) {
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

  // Vista actual: arrastra filtros. Todo el padrón: sólo el estado vigente.
  const view = (format: string) => href({ format, scope: 'view', cohort, status, ...(q ? { q } : {}) });
  const all = (format: string) => href({ format, scope: 'all', status });
  const hasFilter = cohort !== 'all' || !!q;

  const item = 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-ink hover:bg-surface-container';

  return (
    <div ref={wrapRef} className="relative">
      <Button type="button" variant="secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Download size={16} strokeWidth={2} aria-hidden="true" /> Exportar
        <ChevronDown size={14} strokeWidth={2.25} aria-hidden="true" className={cn('transition-transform', open && 'rotate-180')} />
      </Button>

      {open ? (
        <div role="menu" aria-label="Exportar visitantes"
          className="absolute right-0 top-11 z-30 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
            Vista actual{hasFilter ? ` · ${filteredTotal.toLocaleString('en-US')}` : ''}
          </p>
          <a role="menuitem" href={view('xlsx')} className={cn(item, focusRing)} onClick={() => setOpen(false)}>
            <FileSpreadsheet size={15} strokeWidth={2} aria-hidden="true" className="text-success-fg" /> Excel (.xlsx)
          </a>
          <a role="menuitem" href={view('csv')} className={cn(item, focusRing)} onClick={() => setOpen(false)}>
            <FileText size={15} strokeWidth={2} aria-hidden="true" className="text-muted" /> CSV
          </a>

          <div className="my-1 border-t border-line" />
          <p className="px-2.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
            Todo el padrón
          </p>
          <a role="menuitem" href={all('xlsx')} className={cn(item, focusRing)} onClick={() => setOpen(false)}>
            <FileSpreadsheet size={15} strokeWidth={2} aria-hidden="true" className="text-success-fg" /> Excel (.xlsx)
          </a>
          <a role="menuitem" href={all('csv')} className={cn(item, focusRing)} onClick={() => setOpen(false)}>
            <FileText size={15} strokeWidth={2} aria-hidden="true" className="text-muted" /> CSV
          </a>
        </div>
      ) : null}
    </div>
  );
}
