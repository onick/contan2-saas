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
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn, focusRing } from '../ui/cn';
import { ShellDataProvider } from './ShellData';
import { CommandPalette } from './CommandPalette';

export const SIDEBAR_COOKIE = 'sidebar_collapsed';

// Preferencia explícita: =1 plegada, =0 desplegada; sin cookie manda el valor por defecto de la
// página (`defaultCollapsed`, p. ej. la Puerta en tablet). En el servidor no hay cookie → defecto.
const readCookie = (fallback: boolean): boolean => {
  if (typeof document === 'undefined') return fallback;
  const parts = document.cookie.split('; ');
  if (parts.includes(`${SIDEBAR_COOKIE}=1`)) return true;
  if (parts.includes(`${SIDEBAR_COOKIE}=0`)) return false;
  return fallback;
};

// Corre ANTES del paint (inline, bloqueante): aplica al shell la preferencia guardada (si existe;
// sin cookie queda el valor por defecto con el que se renderizó el servidor).
const PREPAINT = `try{var m=document.cookie.match(/(?:^|; )${SIDEBAR_COOKIE}=([01])/);if(m){document.currentScript.parentElement.setAttribute('data-sidebar',m[1]==='1'?'collapsed':'expanded')}}catch(e){}`;

// collapsed/toggle = riel de desktop (md+). La navegación mobile la gestiona
// la barra inferior fija (MobileNav), no un drawer off-canvas.
interface SidebarCtx { collapsed: boolean; toggle: () => void }
const Ctx = createContext<SidebarCtx>({ collapsed: false, toggle: () => {} });
export function useSidebar(): SidebarCtx { return useContext(Ctx); }

export function SidebarShell({ children, role = null, defaultCollapsed = false }: { children: ReactNode; role?: string | null; defaultCollapsed?: boolean }) {
  // Initializer (no effect): en hidratación el estado ya es el de la cookie →
  // coincide con el DOM que el script inline corrigió pre-paint.
  const [collapsed, setCollapsed] = useState(() => readCookie(defaultCollapsed));

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

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
    <Ctx.Provider value={{ collapsed, toggle }}>
      <ShellDataProvider initialRole={role}>
        <div
          data-sidebar={collapsed ? 'collapsed' : 'expanded'}
          suppressHydrationWarning
          className="group/shell min-h-dvh bg-page md:grid md:grid-cols-[auto_minmax(0,1fr)]"
        >
          <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />
          {children}
        </div>
        {/* Command palette (⌘K): portal a body, montado una vez para todo el shell. */}
        <CommandPalette />
      </ShellDataProvider>
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
