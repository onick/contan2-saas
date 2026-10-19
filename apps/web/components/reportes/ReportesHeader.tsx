'use client';

// Encabezado de Reportes: título + las dos acciones — «Asistente» y «Descargar PDF ▾» (panel de descargas).

import { ReportsAgent } from './ReportsAgent';
import { DownloadsMenu, type DownloadsMenuProps } from './ReportesDownloads';

export function ReportesHeader({ canExport, downloads }: { canExport: boolean; downloads: DownloadsMenuProps }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
      <div className="min-w-0">
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink sm:text-[30px]">Reportes</h1>
        <p className="mt-1 text-[14px] text-muted">Resumen ejecutivo con comparación contra el período anterior.</p>
      </div>
      {canExport ? (
        <div className="flex min-w-0 flex-wrap gap-2.5 sm:ml-auto sm:justify-end">
          <ReportsAgent />
          <DownloadsMenu {...downloads} />
        </div>
      ) : null}
    </div>
  );
}
