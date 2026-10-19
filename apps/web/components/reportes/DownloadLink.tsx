'use client';

// Botón de descarga que es un enlace real (href con los filtros vigentes: abrir en pestaña nueva y "copiar enlace"
// siguen funcionando) pero que, con clic normal, baja el archivo en la página con estado «Generando…» y errores
// legibles (useDownloads). Targets de 44 px en móvil, 40 px en escritorio.

import { Download, FileText, Loader2, Table2 } from 'lucide-react';
import { cn, focusRing } from '../ui';
import type { Downloads } from './useDownloads';

const ICON = { PDF: FileText, Excel: Download, CSV: Table2 } as const;

export interface DownloadLinkProps {
  /** Identifica la descarga para el estado «Generando…». */
  id: string;
  kind: keyof typeof ICON;
  /** Alcance para el nombre accesible: «Informe del período». */
  scope: string;
  href: string;
  dl: Downloads;
  /** Sin permiso/datos para generar todavía (p. ej. falta elegir un ciclo). */
  disabled?: boolean;
  primary?: boolean;
  /** Texto visible cuando «kind» solo no distingue (p. ej. dos Excel en la misma fila: «Excel del mes» / «Excel del año»). */
  label?: string;
}

export function DownloadLink({ id, kind, scope, href, dl, disabled = false, primary = false, label }: DownloadLinkProps) {
  const Icon = ICON[kind];
  const generating = dl.busy === id;
  const blocked = disabled || (dl.busy !== null && !generating);
  const cls = cn(
    'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-field px-3 text-[13px] font-semibold transition-colors sm:min-h-10',
    primary ? 'bg-brand text-brand-fg hover:brightness-95' : 'border border-line bg-surface text-ink hover:bg-surface-container',
    blocked && 'pointer-events-none opacity-50',
    focusRing,
  );
  const content = generating
    ? (<><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Generando…</>)
    : (<><Icon size={15} aria-hidden="true" /> {label ?? kind}</>);
  const name = generating ? `Generando ${kind} · ${scope}` : `${kind} · ${scope}`;

  if (disabled) {
    return <span role="link" aria-disabled="true" aria-label={name} className={cls}>{content}</span>;
  }
  return (
    <a
      href={href}
      aria-label={name}
      aria-busy={generating || undefined}
      aria-disabled={blocked || undefined}
      onClick={dl.linkClick(id, href)}
      className={cls}
    >
      {content}
    </a>
  );
}
