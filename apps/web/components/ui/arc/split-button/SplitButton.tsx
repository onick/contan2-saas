'use client';

// Portado de arc-library (https://github.com/kuratlielia/arc-library) · MIT © 2026 Elia Kuratli.
// Origen: registry/components/split-button/split-button.tsx @ b40c890 (2026-10-16). Adaptado a contan2: Tailwind v4 +
// tokens de marca por tenant, sin `motion` (CSS + prefers-reduced-motion), es-DO. Ver ../ATTRIBUTION.md.
//
// Se descartó el morph de ancho/glifos/ícono de Arc. El menú reutiliza el DropdownMenu del kit
// (no hay un segundo sistema de popover). Añadido respecto a Arc: href/download, loading,
// tamaños, y deshabilitado por mitad.

import type { MouseEvent } from 'react';
import Link from 'next/link';
import { ChevronDown, Loader2, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuChevron,
} from '../../DropdownMenu';
import { cn, focusRing } from '../../cn';

export interface SplitButtonAction {
  label: string;
  /** Si hay `href`, el ítem es un enlace (para descargas o navegación). */
  href?: string;
  download?: boolean | string;
  onSelect?: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  destructive?: boolean;
  /** Nota secundaria bajo la etiqueta (y `title`): p. ej. por qué está deshabilitado. */
  hint?: string;
}

export interface SplitButtonProps {
  /** Texto de la acción principal. */
  label: string;
  /** Si se pasa, la mitad principal es un enlace. */
  href?: string;
  download?: boolean | string;
  /** Con `href`, se llama al hacer clic en el enlace (p. ej. para interceptar la descarga). */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  icon?: LucideIcon;
  actions: SplitButtonAction[];
  /** Nombre accesible del gatillo del menú. Por defecto `${label}: más acciones`. */
  menuLabel?: string;
  /**
   * Si se pasa, el gatillo NO abre el menú de acciones sino que llama a esto (p. ej. para abrir un
   * panel propio). Se anuncia como `aria-haspopup="dialog"` con `aria-expanded={menuExpanded}`.
   */
  onMenuPress?: () => void;
  menuExpanded?: boolean;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
  /** Deshabilita ambas mitades. */
  disabled?: boolean;
  primaryDisabled?: boolean;
  menuDisabled?: boolean;
  /** Deshabilita ambas mitades y muestra un indicador en la principal. */
  loading?: boolean;
  className?: string;
}

const sizeCls = {
  sm: { half: 'min-h-8 text-[13px]', main: 'gap-1.5 pl-3 pr-2.5', menu: 'w-8', icon: 14 },
  md: { half: 'min-h-11 md:min-h-10 text-sm', main: 'gap-1.5 pl-4 pr-3.5', menu: 'w-10', icon: 16 },
} as const;

const variantCls = {
  // Texto sobre el color de marca: token derivado por contraste (brand-fg), como Button primary.
  primary: {
    group: 'bg-brand text-brand-fg shadow-sm',
    half: 'text-brand-fg hover:brightness-95 active:brightness-90',
    divider: 'border-l border-l-brand-fg/30',
  },
  secondary: {
    group: 'border border-line bg-surface text-ink',
    half: 'text-ink hover:bg-subtle active:bg-surface-container',
    divider: 'border-l border-l-line',
  },
} as const;

export function SplitButton({
  label, href, download, onClick, icon: Icon, actions, menuLabel, onMenuPress, menuExpanded = false, variant = 'primary', size = 'md',
  disabled = false, primaryDisabled = false, menuDisabled = false, loading = false, className,
}: SplitButtonProps) {
  const s = sizeCls[size];
  const v = variantCls[variant];
  const mainOff = disabled || loading || primaryDisabled;
  const menuOff = disabled || loading || menuDisabled;

  const halfBase = cn(
    'inline-flex items-center justify-center font-semibold transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    s.half, v.half, focusRing,
  );
  const mainCls = cn(halfBase, s.main, 'arc-split-main rounded-l-pill');
  const content = (
    <>
      {loading
        ? <Loader2 size={s.icon} className="animate-spin" aria-hidden="true" />
        : Icon ? <Icon size={s.icon} aria-hidden="true" /> : null}
      {label}
    </>
  );

  let main: React.ReactNode;
  if (href && !mainOff) {
    main = download || !href.startsWith('/')
      ? <a href={href} download={download || undefined} onClick={onClick} className={mainCls}>{content}</a>
      : <Link href={href} onClick={onClick} className={mainCls}>{content}</Link>;
  } else {
    main = (
      <button
        type="button"
        onClick={onClick}
        disabled={mainOff}
        aria-busy={loading || undefined}
        className={mainCls}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      role="group"
      data-variant={variant}
      data-size={size}
      className={cn('arc-split inline-flex items-stretch rounded-pill', v.group, className)}
    >
      {main}
      {onMenuPress ? (
        <button
          type="button"
          disabled={menuOff}
          aria-label={menuLabel ?? `${label}: más acciones`}
          aria-haspopup="dialog"
          aria-expanded={menuExpanded}
          onClick={onMenuPress}
          className={cn(halfBase, 'rounded-r-pill', v.divider, s.menu)}
        >
          <ChevronDown size={s.icon} strokeWidth={1.8} aria-hidden="true" className="arc-chevron flex-none" />
        </button>
      ) : (
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={menuOff}
          aria-label={menuLabel ?? `${label}: más acciones`}
          className={cn(halfBase, 'rounded-r-pill', v.divider, s.menu)}
        >
          <DropdownMenuChevron size={s.icon} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} collisionPadding={12} loop>
          {actions.map((a) => {
            const linkItem = a.href && !a.disabled;
            const text = a.hint ? (
              <span className="flex min-w-0 flex-col">
                <span>{a.label}</span>
                <span className="text-[11.5px] font-normal leading-snug text-faint">{a.hint}</span>
              </span>
            ) : a.label;
            if (!linkItem) {
              return (
                <DropdownMenuItem
                  key={a.label}
                  icon={a.icon}
                  disabled={a.disabled}
                  destructive={a.destructive}
                  onSelect={a.onSelect}
                  title={a.hint}
                >
                  {text}
                </DropdownMenuItem>
              );
            }
            const Cmp = a.download || !a.href!.startsWith('/') ? 'a' : Link;
            return (
              <DropdownMenuItem key={a.label} asChild destructive={a.destructive} onSelect={a.onSelect}>
                <Cmp href={a.href!} title={a.hint} {...(a.download ? { download: a.download } : {})} className="no-underline">
                  {a.icon ? <a.icon size={15} aria-hidden="true" className="flex-none" /> : null}
                  {text}
                </Cmp>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      )}
    </div>
  );
}

export default SplitButton;
