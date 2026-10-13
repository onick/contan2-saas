'use client';

// components/shell/MobileNav.tsx · navegación en CELULAR (<md).
// Barra inferior fija de hasta 4 ítems + botón "Más" que abre un Sheet con
// el resto del menú. Usa NAV_ITEMS filtrados por rol (igual que el Sidebar) —
// el confinamiento es consistente en ambas superficies.

import { useState, useMemo, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { NAV_ITEMS, NAV_GROUPS, filterNavByRole, type NavItem } from '../../lib/shell/nav';
import { Sheet } from '../ui/Sheet';
import { LogoutButton } from './LogoutButton';
import { cn } from '../ui/cn';

// Orden preferido para el riel inferior (caso general / admin).
// Se usa la intersección con los ítems filtrados para respetar los flags
// PUERTA/BIBLIOTECA y el confinamiento por rol.
const PREFERRED_BOTTOM = ['dashboard', 'actividades', 'usuarios', 'biblioteca'];

export function MobileNav({ activeKey, role }: { activeKey?: string; role?: string | null }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);

  // Aplica el allowlist por rol (igual que el Sidebar) para que el confinamiento
  // sea consistente en ambas superficies.
  const filteredItems = useMemo(() => filterNavByRole(NAV_ITEMS, role), [role]);

  // Tabs inferiores: ítems preferidos presentes en los ítems filtrados.
  // Si ninguno coincide (rol muy confinado), toma los primeros 4 del set filtrado.
  const bottomTabs = useMemo<NavItem[]>(() => {
    const preferred = PREFERRED_BOTTOM.map((k) => filteredItems.find((i) => i.key === k)).filter(
      (x): x is NavItem => !!x,
    );
    return preferred.length > 0 ? preferred : filteredItems.slice(0, 4);
  }, [filteredItems]);

  const bottomKeySet = useMemo(() => new Set(bottomTabs.map((i) => i.key)), [bottomTabs]);

  // Ítems del Sheet: todo lo que no esté en la barra, agrupado.
  const sheetGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        group,
        items: filteredItems.filter((i) => i.group === group && !bottomKeySet.has(i.key)),
      })).filter((g) => g.items.length > 0),
    [filteredItems, bottomKeySet],
  );

  return (
    <div className="md:hidden">
      {/* Barra inferior fija */}
      <nav
        aria-label="Navegación inferior"
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        {bottomTabs.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeKey;
          return (
            <a
              key={item.key}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-colors',
                active ? 'text-brand-text' : 'text-muted hover:text-ink',
              )}
            >
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </a>
          );
        })}
        <button
          ref={moreBtnRef}
          type="button"
          aria-label="Más opciones"
          aria-expanded={moreOpen}
          aria-controls="mobile-nav-sheet"
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium text-muted transition-colors hover:text-ink"
        >
          <MoreHorizontal size={22} strokeWidth={1.75} aria-hidden="true" />
          <span>Más</span>
        </button>
      </nav>

      {/* Sheet: resto del menú + cierre de sesión */}
      <Sheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Menú"
        dismissOnOverlay
        width={340}
        returnFocusRef={moreBtnRef}
      >
        <div id="mobile-nav-sheet" className="flex flex-col gap-1">
          {sheetGroups.map(({ group, items }) => (
            <div key={group} className="mb-2">
              <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                {group}
              </p>
              {items.map((item) => {
                const Icon = item.icon;
                const active = item.key === activeKey;
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex h-11 items-center gap-3 rounded-[8px] px-3 text-[14px] font-medium transition-colors',
                      active
                        ? 'bg-brand-soft font-semibold text-brand-text'
                        : 'text-muted hover:bg-surface-container hover:text-ink',
                    )}
                  >
                    <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </div>
          ))}
          <div className="mt-2 border-t border-line pt-3">
            <LogoutButton />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
