'use client';

// components/shell/ShellData.tsx · isla client del shell admin.
//   · Un solo fetch a /app/api/shell/summary → rol (para filtrar la nav del
//     command palette) + badges numéricos vivos (conteos reales del tenant).
//   · Estado del command palette (⌘K) + atajo global (guard de inputs).
//   · LiveBadge / SearchTrigger consumen este contexto; se montan dentro del
//     Sidebar (Server Component) sin volverlo client.
// No bloquea el render del shell: los badges aparecen cuando llega el fetch.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import type { LiveBadgeSource } from '../../lib/shell/nav';
import { cn, focusRing } from '../ui/cn';

type Badges = Record<LiveBadgeSource, number>;

interface ShellCtx {
  role: string | null;
  badges: Badges | null;
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

const Ctx = createContext<ShellCtx>({
  role: null,
  badges: null,
  paletteOpen: false,
  openPalette: () => {},
  closePalette: () => {},
});

export function useShell(): ShellCtx {
  return useContext(Ctx);
}

export function ShellDataProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<string | null>(null);
  const [badges, setBadges] = useState<Badges | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Un fetch al montar; falla en silencio (badges/rol quedan null → sin ruido).
  // Promise.resolve(fetch(...)) convierte un throw síncrono (p.ej. fetch ausente
  // en un entorno de test) en promesa rechazada que cae en el catch.
  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => fetch('/app/api/shell/summary', { cache: 'no-store' }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        if (typeof data.role === 'string') setRole(data.role);
        if (data.badges) setBadges(data.badges as Badges);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Atajo global ⌘K / Ctrl+K — no lo roba dentro de campos de texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        const t = e.target as HTMLElement | null;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (typing) return;
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Ctx.Provider value={{ role, badges, paletteOpen, openPalette, closePalette }}>
      {children}
    </Ctx.Provider>
  );
}

// Badge numérico vivo para un ítem de nav. Oculto mientras no hay dato o es 0.
// Se esconde en modo riel (colapsado) igual que el badge estático.
export function LiveBadge({ source }: { source: LiveBadgeSource }) {
  const { badges } = useShell();
  const n = badges?.[source] ?? 0;
  if (!n) return null;
  return (
    <span
      aria-hidden="true"
      className="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-[#b35400] group-data-[sidebar=collapsed]/shell:hidden"
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

// Buscador del topbar (el que ya existía, ahora funcional): abre el command
// palette. Reemplaza el placeholder estático. Muestra el atajo ⌘K real.
export function TopbarSearch() {
  const { openPalette } = useShell();
  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label="Buscar (⌘K)"
      className={cn(
        'ml-2 hidden min-w-0 max-w-[420px] flex-1 items-center gap-2.5 rounded-full bg-surface-container px-4 py-2.5 text-[13px] text-faint transition-colors hover:text-muted md:flex',
        focusRing,
      )}
    >
      <Search size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="truncate">Buscar actividad, persona o reporte…</span>
      <kbd className="ml-auto hidden items-center gap-0.5 rounded-[5px] border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] font-medium text-faint sm:inline-flex">
        ⌘K
      </kbd>
    </button>
  );
}
