'use client';

// components/shell/SidebarShell.tsx · colapso del sidebar con mejores prácticas:
//
//   · Preferencia en COOKIE + SCRIPT INLINE pre-paint (patrón next-themes): el
//     script corrige data-sidebar ANTES del primer paint → cero flash al recargar,
//     sin volver async el AppShell (las páginas sync siguen testeables).
//     En hidratación, el useState lee la misma cookie → el DOM ya coincide
//     (suppressHydrationWarning cubre el delta HTML-estático vs DOM corregido).
//   · Colapso 100% CSS por data-attribute (variantes group-data en el Sidebar):
//     el Sidebar sigue siendo Server Component; togglear NO re-renderiza nada.
//   · A11y: aria-expanded/aria-controls en el toggle, atajo estándar ⌘B/Ctrl+B
//     (guard de inputs), labels claros, tooltips nativos en modo iconos.
//   · Persistencia 1 año, SameSite=Lax. Transición sólo motion-safe.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, Menu } from 'lucide-react';
import { cn, focusRing } from '../ui/cn';

export const SIDEBAR_COOKIE = 'sidebar_collapsed';

const readCookie = (): boolean =>
  typeof document !== 'undefined' && document.cookie.split('; ').includes(`${SIDEBAR_COOKIE}=1`);

// Corre ANTES del paint (inline, bloqueante): aplica el estado guardado al shell.
const PREPAINT = `try{if(document.cookie.split('; ').includes('${SIDEBAR_COOKIE}=1')){document.currentScript.parentElement.setAttribute('data-sidebar','collapsed')}}catch(e){}`;

// collapsed/toggle = riel de desktop (md+). mobileOpen = drawer off-canvas en
// celular (<md), donde el sidebar no existe → sin él no hay navegación.
interface SidebarCtx { collapsed: boolean; toggle: () => void; mobileOpen: boolean; openMobile: () => void; closeMobile: () => void }
const Ctx = createContext<SidebarCtx>({ collapsed: false, toggle: () => {}, mobileOpen: false, openMobile: () => {}, closeMobile: () => {} });
export function useSidebar(): SidebarCtx { return useContext(Ctx); }

export function SidebarShell({ children }: { children: ReactNode }) {
  // Initializer (no effect): en hidratación el estado ya es el de la cookie →
  // coincide con el DOM que el script inline corrigió pre-paint.
  const [collapsed, setCollapsed] = useState(readCookie);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // Drawer mobile abierto: Escape cierra + bloqueo de scroll del body.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMobile(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [mobileOpen, closeMobile]);

  // Atajo estándar ⌘B (macOS) / Ctrl+B — no roba el atajo dentro de campos de texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'b' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <Ctx.Provider value={{ collapsed, toggle, mobileOpen, openMobile, closeMobile }}>
      <div
        data-sidebar={collapsed ? 'collapsed' : 'expanded'}
        suppressHydrationWarning
        className="group/shell min-h-screen bg-page md:grid md:grid-cols-[auto_minmax(0,1fr)]"
      >
        <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />
        {children}
      </div>
    </Ctx.Provider>
  );
}

// Botón de colapso (vive dentro del Sidebar server vía import de client island).
export function SidebarToggle({ className }: { className?: string }) {
  const { collapsed, toggle } = useSidebar();
  const label = collapsed ? 'Expandir navegación' : 'Colapsar navegación';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!collapsed}
      aria-controls="app-sidebar"
      aria-keyshortcuts="Control+B Meta+B"
      aria-label={label}
      title={`${label} (⌘B)`}
      className={cn(
        'grid h-9 w-9 flex-none place-items-center rounded-lg text-faint transition-colors hover:bg-surface-container hover:text-muted',
        focusRing,
        className,
      )}
    >
      {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden="true" /> : <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden="true" />}
    </button>
  );
}

// Hamburguesa de navegación SOLO en mobile (<md): abre el drawer (MobileNav).
export function MobileNavToggle({ className }: { className?: string }) {
  const { mobileOpen, openMobile } = useSidebar();
  return (
    <button
      type="button"
      onClick={openMobile}
      aria-expanded={mobileOpen}
      aria-controls="mobile-nav"
      aria-label="Abrir navegación"
      className={cn('grid h-10 w-10 flex-none place-items-center rounded-lg text-muted transition-colors hover:bg-surface-container hover:text-ink', focusRing, className)}
    >
      <Menu size={22} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
