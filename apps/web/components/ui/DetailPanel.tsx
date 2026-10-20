'use client';

// components/ui/DetailPanel.tsx · patrón "lista + panel de detalle" (master-detail).
//
//  - xl (≥1280px): el detalle es una COLUMNA PLEGABLE a la derecha de la lista (la tabla no
//    se tapa). Cerrado, la columna mide 0 y la lista ocupa todo el ancho; al abrir, la
//    grilla anima `grid-template-columns` (0 → ancho) y el contenido SUBE desde abajo
//    (`.detail-rise`, se reanima al cambiar `contentKey`). Con `reserve` + `empty` la
//    columna se reserva siempre con un estado vacío. Raíz: <aside role="region"
//    aria-label={title} data-detail-panel data-detail-state="open|closed|reserved">.
//    Escape lo cierra (foco dentro, en el disparador o en el body).
//  - < xl: HOJA INFERIOR (overlay modal): <div role="dialog" aria-modal data-detail-panel>
//    que sube desde abajo (`.detail-sheet`), con fondo, foco atrapado, Escape y clic fuera
//    para cerrar (Radix Dialog). Cerrado no renderiza nada.
//  - Una sola instancia a la vez (matchMedia): el estado del contenido vive en el
//    consumidor, así que ensanchar/estrechar la ventana no pierde nada.
//
// Uso: el consumidor pone <DetailLayout> alrededor de [lista + <DetailPanel/>]; la grilla
// es de DetailLayout (ancho "md"=320 o "lg"=380) y se pliega sola con `:has()` cuando el
// aside declara data-detail-state="closed" (sin plomería de props entre hermanos).
// `children` son los <TabsContent> (si hay `tabs`) o el cuerpo directo.
// `mode="overlay"` fuerza siempre el panel lateral (páginas sin columna reservada).

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { Tabs, type TabItem } from './Tabs';

const XL_QUERY = '(min-width: 1280px)';

function subscribeXl(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(XL_QUERY);
  mq.addEventListener?.('change', cb);
  return () => mq.removeEventListener?.('change', cb);
}
const xlSnapshot = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(XL_QUERY).matches;
// SSR: se asume columna (el aside lleva `hidden xl:block`, así que en pantallas chicas no se ve).
const xlServerSnapshot = (): boolean => true;

export interface DetailPanelEmpty {
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  description?: string;
}

export interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  /** Nombre accesible de la región/diálogo y encabezado visible, p. ej. "Detalles de la persona". */
  title: string;
  /** Avatar / nombre / chips / carné. */
  header?: ReactNode;
  tabs?: TabItem[];
  /** Pestaña activa (controlado). Sin `tab` el panel la gestiona solo (arranca en `defaultTab` o la primera). */
  tab?: string;
  defaultTab?: string;
  onTabChange?: (value: string) => void;
  /** <TabsContent> (con `tabs`) o el cuerpo directo (sin `tabs`). */
  children?: ReactNode;
  /** Acciones al pie. */
  footer?: ReactNode;
  /** Contenido de la columna cuando no hay selección (solo xl y solo con `reserve`). */
  empty?: DetailPanelEmpty;
  /** Reserva la columna aunque no haya selección, mostrando `empty`. Por defecto la columna se pliega. */
  reserve?: boolean;
  /** Identidad del contenido (id/código): al cambiar, el cuerpo vuelve a entrar desde abajo. */
  contentKey?: string | number | null;
  /** id de un elemento que nombra el panel (reemplaza a aria-label). */
  labelledBy?: string;
  closeLabel?: string;
  /** 'auto' = columna en xl / overlay debajo; 'overlay' = siempre panel lateral. */
  mode?: 'auto' | 'overlay';
  className?: string;
}

export function DetailPanel({
  open, onClose, title, header, tabs, tab, defaultTab, onTabChange, children, footer, empty, reserve = false, contentKey,
  labelledBy, closeLabel = 'Cerrar detalles', mode = 'auto', className,
}: DetailPanelProps) {
  const xl = useSyncExternalStore(subscribeXl, xlSnapshot, xlServerSnapshot);
  const asColumn = mode === 'auto' && xl;

  // Foco en modo columna: recuerda el disparador al abrir y lo restituye al cerrar
  // (en modo overlay lo hace Radix).
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (open && !wasOpen.current) {
      triggerRef.current = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    } else if (!open && wasOpen.current && asColumn) {
      const t = triggerRef.current;
      const a = document.activeElement;
      if (t && t.isConnected && (!a || a === document.body)) t.focus();
    }
    wasOpen.current = open;
  }, [open, asColumn]);

  // Escape cierra la columna cuando el foco está dentro, en el disparador o en el <body>
  // (en el overlay lo hace Radix). No pisa a menús/diálogos que ya manejaron la tecla.
  const asideRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!open || !asColumn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as Node | null;
      if (t === document.body || t === triggerRef.current || (t && asideRef.current?.contains(t))) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, asColumn]);

  const [innerTab, setInnerTab] = useState(defaultTab ?? tabs?.[0]?.value ?? '');
  const wanted = tab ?? innerTab;
  const current = tabs && tabs.length > 0 && !tabs.some((t) => t.value === wanted) ? tabs[0]!.value : wanted;
  const changeTab = (v: string) => { setInnerTab(v); onTabChange?.(v); };

  const labelProps = labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': title };

  const heading = (dialog: boolean) => {
    const text = <h2 className="text-[14px] font-bold tracking-tight text-ink">{title}</h2>;
    return (
      <div className="flex items-start justify-between gap-2">
        {dialog ? <RadixDialog.Title asChild>{text}</RadixDialog.Title> : text}
        <IconButton label={closeLabel} variant="outline" size={dialog ? 'md' : 'sm'} onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
    );
  };

  const body = (dialog: boolean) => (
    <>
      {heading(dialog)}
      {header ? <div className="mt-3">{header}</div> : null}
      {tabs && tabs.length > 0 ? (
        <Tabs value={current} onValueChange={changeTab} tabs={tabs} className="mt-3.5 gap-2">{children}</Tabs>
      ) : (
        <div className="mt-3.5">{children}</div>
      )}
      {footer ? <div className="mt-4 border-t border-line pt-4">{footer}</div> : null}
    </>
  );

  // ── Columna plegable (xl) ──
  if (asColumn) {
    const Icon = empty?.icon;
    const reserved = !open && reserve && !!empty;
    const state = open ? 'open' : reserved ? 'reserved' : 'closed';
    return (
      <aside
        ref={asideRef}
        role="region"
        data-detail-panel
        data-detail-state={state}
        {...labelProps}
        {...(state === 'closed' ? { 'aria-hidden': true, inert: true } : {})}
        className="sticky top-4 hidden min-w-0 overflow-hidden xl:block"
      >
        {/* Ancho fijo (var --detail-w de DetailLayout): al animar la columna el contenido no se re-envuelve, solo se revela. */}
        <div
          className={cn(
            'max-h-[calc(100dvh-2rem)] w-[var(--detail-w,380px)] overflow-y-auto rounded-card border border-line bg-surface p-5 md:p-6',
            !open && 'text-center',
            className,
          )}
        >
          {open ? (
            <div key={contentKey ?? 'detail'} className="detail-rise">{body(false)}</div>
          ) : reserved && empty ? (
            <>
              {Icon ? <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-container text-faint"><Icon size={22} strokeWidth={1.7} /></span> : null}
              <p className="mt-3 text-[13.5px] font-bold text-ink">{empty.title}</p>
              {empty.description ? <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{empty.description}</p> : null}
            </>
          ) : null}
        </div>
      </aside>
    );
  }

  // ── Overlay (< xl, o mode="overlay") ──
  return (
    <RadixDialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="detail-backdrop fixed inset-0 z-40 bg-ink/40" />
        <RadixDialog.Content
          data-detail-panel
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            // Radix devuelve el foco a su <Trigger>, que acá no existe: lo devolvemos al disparador real.
            e.preventDefault();
            const t = triggerRef.current;
            if (t && t.isConnected) t.focus();
          }}
          {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
          className={cn(
            'detail-sheet fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto',
            'rounded-t-2xl border-t border-line bg-surface p-4 shadow-xl focus:outline-none md:mx-auto md:max-w-2xl md:p-5',
            className,
          )}
        >
          <div key={contentKey ?? 'detail'} className="detail-rise">{body(true)}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// Ancho de la columna por tamaño. Plegado (`data-detail-state="closed"` en el aside hijo) la columna
// y el gap valen 0 → la lista ocupa todo el ancho; el cambio se anima (grid-template-columns, Chromium
// 107+, Firefox 66+, Safari 16+; antes de eso simplemente salta sin transición).
const COLS = {
  md: '[--detail-w:320px] xl:grid-cols-[minmax(0,1fr)_var(--detail-w)]',
  lg: '[--detail-w:380px] xl:grid-cols-[minmax(0,1fr)_var(--detail-w)]',
} as const;
const COLLAPSE = 'xl:has-[>aside[data-detail-state=closed]]:grid-cols-[minmax(0,1fr)_0px] xl:has-[>aside[data-detail-state=closed]]:gap-x-0';

/** Grilla lista + columna de detalle. Hijos: [lista, <DetailPanel/>] (el panel solo ocupa columna en xl). */
export function DetailLayout({ children, width = 'lg', className }: { children: ReactNode; width?: keyof typeof COLS; className?: string }) {
  return (
    <div
      className={cn(
        'xl:grid xl:items-start xl:gap-x-5 xl:transition-[grid-template-columns,column-gap] xl:duration-300 xl:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        COLS[width], COLLAPSE, className,
      )}
    >
      {children}
    </div>
  );
}
