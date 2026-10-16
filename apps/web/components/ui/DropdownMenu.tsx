'use client';

// Movimiento del menú portado de arc-library (MIT © 2026 Elia Kuratli), sin `motion`:
// el CSS vive en ./arc/dropdown-menu/dropdown-menu.css (clases arc-menu*). Ver
// ./arc/ATTRIBUTION.md. La API pública del kit no cambia.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent, Ref } from 'react';
import * as RadixDropdown from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, ChevronRight, Circle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export const DropdownMenu = RadixDropdown.Root;
export const DropdownMenuTrigger = RadixDropdown.Trigger;
export const DropdownMenuGroup = RadixDropdown.Group;
export const DropdownMenuSub = RadixDropdown.Sub;
export const DropdownMenuRadioGroup = RadixDropdown.RadioGroup;

// El fondo del ítem resaltado lo pinta el <span data-arc-highlight> deslizante del
// contenido; aquí solo queda el contorno para forced-colors (alto contraste).
const itemCls = cn(
  'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-[14px] text-ink outline-none',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  'forced-colors:data-[highlighted]:outline forced-colors:data-[highlighted]:outline-2',
);

const ITEM_SELECTOR = '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]';
/** Tope del escalonado: los ítems 3+ entran junto con el tercero (3 × 20 ms). */
export const MENU_STAGGER_MAX = 3;

type Highlight = { top: number; height: number; danger: boolean; glide: boolean };

/** Asigna `--i` (0..4) a cada ítem; ref callback: sin efectos ni re-render. */
function setStagger(node: HTMLElement | null) {
  if (!node) return;
  node.querySelectorAll<HTMLElement>(ITEM_SELECTOR).forEach((el, i) => {
    el.style.setProperty('--i', String(Math.min(i, MENU_STAGGER_MAX)));
  });
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Resaltado deslizante sin `motion`: un único <span> se posiciona (translateY + height
 * inline) sobre el ítem enfocado. Con puntero se desliza; con teclado salta. Al salir
 * del ítem se desvanece tras 70 ms (gracia para cruzar separadores).
 */
function useMenuMotion(forwardedRef?: Ref<HTMLDivElement>) {
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const pointer = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const ref = useCallback((node: HTMLDivElement | null) => {
    setStagger(node);
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) (forwardedRef as { current: HTMLDivElement | null }).current = node;
  }, [forwardedRef]);

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const item = target instanceof HTMLElement ? target.closest<HTMLElement>(ITEM_SELECTOR) : null;
    clearTimeout(timer.current);
    if (!item) {
      timer.current = setTimeout(() => setHighlight(null), pointer.current ? 70 : 0);
      return;
    }
    const glide = pointer.current && !prefersReducedMotion();
    setHighlight((cur) => ({
      top: item.offsetTop,
      height: item.offsetHeight,
      danger: item.dataset.tone === 'danger',
      glide: glide && cur !== null,
    }));
  };

  const span = (
    <span
      aria-hidden="true"
      data-arc-highlight=""
      data-tone={highlight?.danger ? 'danger' : undefined}
      data-glide={highlight?.glide ? 'true' : 'false'}
      className="arc-menu-highlight pointer-events-none absolute left-1 right-1 top-0 rounded-lg bg-surface-container data-[tone=danger]:bg-danger-bg"
      style={highlight
        ? { transform: `translateY(${highlight.top}px)`, height: highlight.height, opacity: 1 }
        : { opacity: 0 }}
    />
  );

  return {
    ref,
    span,
    handlers: {
      onFocus,
      onPointerMoveCapture: () => { pointer.current = true; },
      onKeyDownCapture: () => { pointer.current = false; },
    },
  };
}

/** Chevrón del disparador: rota 180° cuando el padre `[aria-haspopup="menu"]` está abierto. */
export function DropdownMenuChevron({ size = 15, className }: { size?: number; className?: string }) {
  return <ChevronDown size={size} strokeWidth={1.8} aria-hidden="true" className={cn('arc-chevron flex-none', className)} />;
}

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  children,
  ref,
  onFocus,
  onPointerMoveCapture,
  onKeyDownCapture,
  ...props
}: RadixDropdown.DropdownMenuContentProps & { ref?: Ref<HTMLDivElement> }) {
  const motion = useMenuMotion(ref);
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content
        sideOffset={sideOffset}
        {...props}
        ref={motion.ref}
        className={cn(
          'arc-menu relative z-50 min-w-[9rem] rounded-card border border-line bg-surface p-1 shadow-lg',
          className,
        )}
        onFocus={(e) => { onFocus?.(e); motion.handlers.onFocus(e); }}
        onPointerMoveCapture={(e) => { onPointerMoveCapture?.(e); motion.handlers.onPointerMoveCapture(); }}
        onKeyDownCapture={(e) => { onKeyDownCapture?.(e); motion.handlers.onKeyDownCapture(); }}
      >
        {motion.span}
        {children}
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  );
}

export interface DropdownMenuItemProps extends RadixDropdown.DropdownMenuItemProps {
  icon?: LucideIcon;
  destructive?: boolean;
}

export function DropdownMenuItem({ icon: Icon, destructive, className, children, asChild, ...props }: DropdownMenuItemProps) {
  return (
    <RadixDropdown.Item
      className={cn(itemCls, destructive && 'text-danger-fg', className)}
      data-tone={destructive ? 'danger' : undefined}
      asChild={asChild}
      {...props}
    >
      {/* Con asChild, Radix Slot exige UN solo hijo: se pasa tal cual (el ícono, si
          hace falta, lo pone el hijo). Sin asChild se antepone el ícono. */}
      {asChild ? children : (
        <>
          {Icon ? <Icon size={15} aria-hidden="true" className="flex-none" /> : null}
          {children}
        </>
      )}
    </RadixDropdown.Item>
  );
}

export function DropdownMenuSeparator({ className, ...props }: RadixDropdown.DropdownMenuSeparatorProps) {
  return (
    <RadixDropdown.Separator
      className={cn('-mx-1 my-1 h-px bg-line', className)}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: RadixDropdown.DropdownMenuLabelProps) {
  return (
    <RadixDropdown.Label
      className={cn('px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-faint', className)}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: RadixDropdown.DropdownMenuCheckboxItemProps) {
  return (
    <RadixDropdown.CheckboxItem
      className={cn(itemCls, className)}
      checked={checked}
      {...props}
    >
      <span className="flex h-4 w-4 flex-none items-center justify-center">
        <RadixDropdown.ItemIndicator>
          <Check size={13} aria-hidden="true" />
        </RadixDropdown.ItemIndicator>
      </span>
      {children}
    </RadixDropdown.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: RadixDropdown.DropdownMenuRadioItemProps) {
  return (
    <RadixDropdown.RadioItem
      className={cn(itemCls, className)}
      {...props}
    >
      <span className="flex h-4 w-4 flex-none items-center justify-center">
        <RadixDropdown.ItemIndicator>
          <Circle size={8} fill="currentColor" aria-hidden="true" />
        </RadixDropdown.ItemIndicator>
      </span>
      {children}
    </RadixDropdown.RadioItem>
  );
}

export function DropdownMenuSubTrigger({ className, children, ...props }: RadixDropdown.DropdownMenuSubTriggerProps) {
  return (
    <RadixDropdown.SubTrigger
      className={cn(itemCls, 'data-[state=open]:bg-surface-container', className)}
      {...props}
    >
      {children}
      <ChevronRight size={14} className="ml-auto flex-none" aria-hidden="true" />
    </RadixDropdown.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  children,
  ref,
  onFocus,
  onPointerMoveCapture,
  onKeyDownCapture,
  ...props
}: RadixDropdown.DropdownMenuSubContentProps & { ref?: Ref<HTMLDivElement> }) {
  const motion = useMenuMotion(ref);
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.SubContent
        {...props}
        ref={motion.ref}
        className={cn(
          'arc-menu relative z-50 min-w-[9rem] rounded-card border border-line bg-surface p-1 shadow-lg',
          className,
        )}
        onFocus={(e) => { onFocus?.(e); motion.handlers.onFocus(e); }}
        onPointerMoveCapture={(e) => { onPointerMoveCapture?.(e); motion.handlers.onPointerMoveCapture(); }}
        onKeyDownCapture={(e) => { onKeyDownCapture?.(e); motion.handlers.onKeyDownCapture(); }}
      >
        {motion.span}
        {children}
      </RadixDropdown.SubContent>
    </RadixDropdown.Portal>
  );
}
