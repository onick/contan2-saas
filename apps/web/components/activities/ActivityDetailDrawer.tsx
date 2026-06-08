'use client';

// apps/web/components/activities/ActivityDetailDrawer.tsx · detalle READ-ONLY de
// una actividad en un drawer lateral (bottom-sheet/fullscreen en mobile).
// Accesible: role=dialog + aria-modal, cierra con Escape y con botón, foco al
// abrir y restaura al cerrar, backdrop clickeable. CERO edición, cero escrituras.

import { useEffect, useId, useRef, useState } from 'react';
import { X, CalendarDays, MapPin, Tag, Users, ImageOff, Pencil, FileText, Loader2 } from 'lucide-react';
import type { Activity } from '../../lib/activities/demoData';
import { fetchActivityDetail } from '../../lib/api/activity-detail';
import { StatusBadge } from './StatusBadge';
import { CoverThumb } from './CoverThumb';
import { StatusActions } from './StatusActions';
import { Button, IconButton, cn, focusRing } from '../ui';

export interface ActivityDetailDrawerProps {
  activity: Activity | null;
  onClose: () => void;
  // Lifecycle B: abrir el drawer de edición para esta actividad (sólo reales).
  onEdit?: (activity: Activity) => void;
  // Tras cambiar el estado (200): el contenedor cierra + router.refresh().
  onChanged?: () => void;
}

export function ActivityDetailDrawer({ activity, onClose, onEdit, onChanged }: ActivityDetailDrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = activity !== null;

  // Detalle completo (Lifecycle A2): el listado no proyecta `description`. Para
  // items REALES (statusRaw) lo traemos bajo demanda y lo mostramos con estado
  // honesto (loading/dato/error), sin bloquear el resto del detalle.
  const realId = activity?.statusRaw ? activity.id : null;
  const [desc, setDesc] = useState<{ phase: 'loading' | 'ready' | 'error'; text: string | null }>({ phase: 'loading', text: null });
  useEffect(() => {
    if (!realId) return;
    let ignore = false;
    setDesc({ phase: 'loading', text: null });
    void fetchActivityDetail(realId).then((r) => {
      if (ignore) return;
      if (r.ok) setDesc({ phase: 'ready', text: r.detail.description });
      else setDesc({ phase: 'error', text: null });
    });
    return () => { ignore = true; };
  }, [realId]);

  // Escape para cerrar + bloqueo de scroll del body + foco al panel; restaura
  // el foco previo al cerrar.
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open, onClose]);

  if (!activity) return null;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity"
      />
      {/* Panel: bottom-sheet en mobile, lateral derecho en md+ */}
      <div
        className={cn(
          'drawer-panel absolute inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t border-line bg-surface shadow-xl',
          'md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0',
          'flex flex-col',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Detalle de actividad</p>
            <h2 id={titleId} className="mt-1 text-lg font-bold leading-tight tracking-tight text-ink">{activity.title}</h2>
          </div>
          <IconButton label="Cerrar detalle" variant="outline" size="sm" onClick={onClose}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Portada 16:9 (fallback si no hay imagen) */}
          <div className="mb-4 aspect-video w-full overflow-hidden rounded-xl bg-surface-container">
            <CoverThumb
              src={activity.imageUrl ?? null}
              alt=""
              className="h-full w-full object-cover"
              fallback={
                <div className="grid h-full w-full place-items-center text-faint">
                  <ImageOff size={28} strokeWidth={1.5} aria-hidden="true" />
                </div>
              }
            />
          </div>
          <div className="mb-4"><StatusBadge status={activity.status} label={activity.statusLabel} /></div>
          <dl className="space-y-3">
            <Row icon={CalendarDays} label="Fecha">{activity.date}</Row>
            <Row icon={MapPin} label="Lugar">{activity.location}</Row>
            <Row icon={Tag} label="Categoría">{activity.category}</Row>
            <Row icon={Users} label="Ocupación">
              {activity.occupancyPct === null
                ? <span className="text-faint">Sin datos</span>
                : <span className="tabular-nums">{activity.registered} / {activity.capacity} <span className="text-faint">· {activity.occupancyPct}%</span></span>}
            </Row>
          </dl>

          {activity.occupancyPct !== null ? (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
                <div className="h-full rounded-full bg-brand" style={{ width: `${activity.occupancyPct}%` }} />
              </div>
            </div>
          ) : null}

          {/* Descripción · del detalle completo (Lifecycle A2). Estado honesto. */}
          {activity.statusRaw ? (
            <div className="mt-5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                <FileText size={13} strokeWidth={1.75} aria-hidden="true" /> Descripción
              </p>
              {desc.phase === 'loading' ? (
                <p className="mt-1 flex items-center gap-1.5 text-[13px] text-faint" aria-busy="true">
                  <Loader2 size={13} strokeWidth={2} aria-hidden="true" className="animate-spin" /> Cargando…
                </p>
              ) : desc.phase === 'error' ? (
                <p className="mt-1 text-[13px] text-faint">No pudimos cargar la descripción.</p>
              ) : desc.text && desc.text.trim() ? (
                <p className="mt-1 whitespace-pre-line text-sm text-ink">{desc.text}</p>
              ) : (
                <p className="mt-1 text-[13px] text-faint">Sin descripción.</p>
              )}
            </div>
          ) : null}

        </div>

        {/* Acciones (Lifecycle B) · sólo para actividades REALES (statusRaw). En
            demo no hay id real que editar/transicionar → vista de solo lectura. */}
        {activity.statusRaw && (onEdit || onChanged) ? (
          <footer className="space-y-3 border-t border-line px-5 py-4">
            {onEdit ? (
              <Button type="button" variant="secondary" className="w-full" onClick={() => onEdit(activity)}>
                <Pencil size={16} strokeWidth={2} aria-hidden="true" /> Editar actividad
              </Button>
            ) : null}
            {onChanged ? (
              <StatusActions id={activity.id} statusRaw={activity.statusRaw} onChanged={onChanged} />
            ) : null}
          </footer>
        ) : (
          <footer className="border-t border-line px-5 py-4">
            <p className="rounded-lg bg-surface-container px-3 py-2 text-[12px] text-faint">
              Vista de solo lectura (datos de demostración).
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof CalendarDays; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn('mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg bg-surface-container text-faint', focusRing)}>
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</dt>
        <dd className="mt-0.5 text-sm text-ink">{children}</dd>
      </div>
    </div>
  );
}
