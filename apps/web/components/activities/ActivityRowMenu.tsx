'use client';

// apps/web/components/activities/ActivityRowMenu.tsx · menú ⋯ ("Más acciones")
// de una fila/card de actividad. Antes el botón era decorativo; ahora despliega
// la MISMA matriz de acciones del drawer de detalle: Ver detalle / Editar /
// Finalizar / Cancelar / Reactivar (según estado real). Las transiciones de
// estado reusan StatusConfirmDialog (confirmación + PATCH; api-v2 arbitra 409).
//
// Accesibilidad/robustez: patrón menu-button (aria-haspopup/expanded, role=menu,
// flechas ↑↓ + Home/End, Escape y click-afuera cierran, foco al abrir). El menú
// se monta en un PORTAL con posición fixed anclada al botón → no lo recorta el
// overflow-x de la tabla; se cierra en scroll/resize para no quedar desanclado.
// Items demo (sin statusRaw) sólo ofrecen "Ver detalle" (no hay id PATCHeable).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Eye, Pencil } from 'lucide-react';
import type { Activity } from '../../lib/activities/demoData';
import { STATUS_ACTIONS, StatusConfirmDialog, type ActionDef } from './StatusActions';
import { IconButton, cn, focusRing } from '../ui';

interface MenuItem {
  key: string;
  label: string;
  icon: typeof Eye;
  danger?: boolean;
  run: () => void;
}

export interface ActivityRowMenuProps {
  activity: Activity;
  onView?: (a: Activity) => void;
  onEdit?: (a: Activity) => void;
  onChanged?: () => void; // transición de estado OK → refresh del contenedor
}

export function ActivityRowMenu({ activity, onView, onEdit, onChanged }: ActivityRowMenuProps) {
  const btnRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [pending, setPending] = useState<ActionDef | null>(null);

  const items: MenuItem[] = [];
  if (onView) items.push({ key: 'ver', label: 'Ver detalle', icon: Eye, run: () => onView(activity) });
  if (onEdit && activity.statusRaw) items.push({ key: 'editar', label: 'Editar', icon: Pencil, run: () => onEdit(activity) });
  if (onChanged && activity.statusRaw) {
    for (const a of STATUS_ACTIONS[activity.statusRaw] ?? []) {
      items.push({ key: a.key, label: a.label, icon: a.icon, danger: a.variant === 'danger', run: () => setPending(a) });
    }
  }

  // Ancla el menú al botón (fixed, alineado a la derecha) y lo abre.
  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const MENU_W = 192; // w-48
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)) });
    setOpen(true);
  };
  const close = () => { setOpen(false); setPos(null); };

  // Click-afuera / Escape / scroll / resize cierran (el fixed quedaría desanclado).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); } };
    const onAway = () => close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onAway, true);
    window.addEventListener('resize', onAway);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onAway, true);
      window.removeEventListener('resize', onAway);
    };
  }, [open]);

  // Foco al primer item al abrir; flechas ↑↓ + Home/End navegan.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
  }, [open]);
  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? []);
    if (els.length === 0) return;
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); els[els.length - 1]?.focus(); }
  };

  if (items.length === 0) return null;

  return (
    <>
      <div ref={btnRef} className="inline-flex">
        <IconButton
          label="Más acciones"
          variant="ghost"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? close() : openMenu())}
        >
          <MoreHorizontal size={18} strokeWidth={2} aria-hidden="true" />
        </IconButton>
      </div>

      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Acciones de ${activity.title}`}
              onKeyDown={onMenuKey}
              style={{ top: pos.top, left: pos.left }}
              className="fixed z-[55] w-48 rounded-xl border border-line bg-surface p-1 shadow-xl"
            >
              {items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  role="menuitem"
                  onClick={() => { close(); it.run(); }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium',
                    it.danger ? 'text-danger-fg hover:bg-danger-bg' : 'text-ink hover:bg-surface-container',
                    focusRing,
                  )}
                >
                  <it.icon size={15} strokeWidth={2} aria-hidden="true" className={it.danger ? undefined : 'text-muted'} />
                  {it.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      {pending ? (
        <StatusConfirmDialog
          id={activity.id}
          action={pending}
          onClose={() => setPending(null)}
          onChanged={() => { setPending(null); onChanged?.(); }}
        />
      ) : null}
    </>
  );
}
