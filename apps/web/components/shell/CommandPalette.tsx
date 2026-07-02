'use client';

// components/shell/CommandPalette.tsx · buscador global (⌘K) del shell admin.
//   · Navegación: filtra NAV_ITEMS por rol, cliente-side (instantáneo).
//   · Entidades: actividades + usuarios del tenant vía /app/api/search (debounce).
//   · Teclado: ↑/↓ mueven, ↵ navega, Esc cierra. Portal a body (escapa
//     containing-blocks con transform/filter). Marca del tenant vía tokens.

import { useEffect, useMemo, useRef, useState, type ElementType, type KeyboardEvent as RKE } from 'react';
import { createPortal } from 'react-dom';
import { Search, CalendarDays, UserRound, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { NAV_ITEMS, filterNavByRole } from '../../lib/shell/nav';
import { useShell } from './ShellData';
import { cn } from '../ui/cn';

type Row = {
  key: string;
  label: string;
  sublabel?: string;
  href: string;
  icon: ElementType;
};

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function CommandPalette() {
  const { paletteOpen, closePalette, role } = useShell();
  const [query, setQuery] = useState('');
  const [entities, setEntities] = useState<{ activities: Row[]; users: Row[] }>({ activities: [], users: [] });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Al abrir: reset + foco. Al cerrar: limpia. Bloqueo de scroll del body.
  useEffect(() => {
    if (!paletteOpen) return;
    setQuery('');
    setEntities({ activities: [], users: [] });
    setActive(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [paletteOpen]);

  // Búsqueda de entidades (debounce + abort). Solo con al menos 1 carácter.
  useEffect(() => {
    if (!paletteOpen) return;
    const q = query.trim();
    if (!q) {
      setEntities({ activities: [], users: [] });
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/app/api/search?q=${encodeURIComponent(q)}`, { cache: 'no-store', signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          setEntities({
            activities: (data.activities ?? []).map((a: { id: string; name: string }) => ({
              key: `a-${a.id}`, label: a.name, sublabel: 'Actividad', href: '/app/actividades', icon: CalendarDays,
            })),
            users: (data.users ?? []).map((u: { id: string; name: string; code: string }) => ({
              key: `u-${u.id}`, label: u.name, sublabel: u.code, href: `/app/usuarios?q=${encodeURIComponent(u.code)}`, icon: UserRound,
            })),
          });
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 160);
    return () => {
      ctl.abort();
      clearTimeout(t);
    };
  }, [query, paletteOpen]);

  // Nav filtrada por rol + por texto (acento-insensible).
  const navRows: Row[] = useMemo(() => {
    const items = filterNavByRole(NAV_ITEMS, role);
    const q = norm(query.trim());
    const matched = q ? items.filter((i) => norm(i.label).includes(q)) : items;
    return matched.map((i) => ({ key: `n-${i.key}`, label: i.label, sublabel: i.group, href: i.href, icon: i.icon }));
  }, [query, role]);

  // Secciones en orden; rows planos para el teclado.
  const sections = useMemo(
    () => [
      { heading: 'Ir a', rows: navRows },
      { heading: 'Actividades', rows: entities.activities },
      { heading: 'Usuarios', rows: entities.users },
    ].filter((s) => s.rows.length > 0),
    [navRows, entities],
  );
  const flat = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  useEffect(() => {
    setActive((a) => (a >= flat.length ? 0 : a));
  }, [flat.length]);

  // Mantener el activo a la vista.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!paletteOpen || typeof document === 'undefined') return null;

  const go = (href: string) => {
    closePalette();
    window.location.href = href;
  };

  const onKeyDown = (e: RKE) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = flat[active];
      if (row) go(row.href);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    }
  };

  let idx = -1;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center px-4 pt-[12vh]">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" aria-hidden="true" onClick={closePalette} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_70px_-15px_rgba(22,24,29,0.5)]"
        onKeyDown={onKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar módulos, actividades o usuarios…"
            className="flex-1 bg-transparent py-4 text-[15px] text-ink outline-none placeholder:text-faint"
            aria-label="Buscar"
          />
          {loading ? <span className="text-[11px] font-medium text-faint">Buscando…</span> : null}
          <kbd className="hidden rounded-[5px] border border-line bg-surface-container px-1.5 py-0.5 text-[11px] font-medium text-faint sm:inline-flex">
            Esc
          </kbd>
        </div>

        {/* Resultados */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {flat.length === 0 ? (
            <div className="px-3 py-10 text-center text-[13px] text-muted">
              {query.trim() ? 'Sin resultados.' : 'Escribe para buscar…'}
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.heading} className="mb-1">
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                  {section.heading}
                </p>
                {section.rows.map((row) => {
                  idx += 1;
                  const i = idx;
                  const RowIcon = row.icon;
                  const isActive = i === active;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      data-idx={i}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(row.href)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                        isActive ? 'bg-primary-container text-on-primary-container' : 'text-ink hover:bg-surface-container',
                      )}
                    >
                      <RowIcon size={17} strokeWidth={1.75} className="shrink-0 opacity-80" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{row.label}</span>
                      {row.sublabel ? (
                        <span className="shrink-0 text-[11.5px] text-muted">{row.sublabel}</span>
                      ) : null}
                      {isActive ? (
                        <CornerDownLeft size={14} strokeWidth={2} className="shrink-0 text-muted" aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Pie con hints de teclado */}
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-faint">
          <span className="inline-flex items-center gap-1"><ArrowUp size={11} /><ArrowDown size={11} /> navegar</span>
          <span className="inline-flex items-center gap-1"><CornerDownLeft size={11} /> abrir</span>
          <span className="ml-auto">Esc cerrar</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
