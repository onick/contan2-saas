'use client';

// apps/web/components/activities/ActivityDetailDrawer.tsx · detalle READ-ONLY de
// una actividad en un drawer lateral ANCHO (bottom-sheet/fullscreen en mobile).
// Accesible: role=dialog + aria-modal, cierra con Escape y con botón, foco al
// abrir y restaura al cerrar, backdrop clickeable. CERO edición, cero escrituras.
//
// RESUMEN POST-EVENTO / EN VIVO (paridad v1 insights/activity-summary): tarjetas
// de asistencias (con % de ocupación y walk-ins), nuevos visitantes (con ratio
// sobre identificados), habituales (con promedio de visitas previas), VIPs (≥10
// visitas) y — mejora v2 — personas en sala contando niños acompañantes. La
// sección sólo aparece cuando hay asistencias; si el fetch falla, se omite (no
// bloquea el resto del detalle).

import { useEffect, useId, useRef, useState } from 'react';
import { X, CalendarDays, MapPin, Tag, Users, ImageOff, Pencil, FileText, Loader2, Sparkles, Repeat2, Crown, UserPlus, Baby, BarChart3 } from 'lucide-react';
import type { Activity } from '../../lib/activities/demoData';
import { fetchActivityDetail, fetchActivitySummary } from '../../lib/api/activity-detail';
import type { ActivitySummary } from '@contan2/contracts';
import { StatusBadge } from './StatusBadge';
import { CoverThumb } from './CoverThumb';
import { StatusActionsMenu } from './StatusActions';
import { AttendeesSection } from './AttendeesSection';
import { InviteAudiencePanel } from './InviteAudiencePanel';
import { InviteProtocolPanel } from './InviteProtocolPanel';
import { ImportGuestsPanel } from './ImportGuestsPanel';
import { InvitationsSection } from './InvitationsSection';
import { Megaphone, Medal, Upload } from 'lucide-react';
import { Button, IconButton, cn, focusRing, useDrawerLifecycle } from '../ui';

export interface ActivityDetailDrawerProps {
  activity: Activity | null;
  onClose: () => void;
  // Lifecycle B: abrir el drawer de edición para esta actividad (sólo reales).
  onEdit?: (activity: Activity) => void;
  // Tras cambiar el estado (200): el contenedor cierra + router.refresh().
  onChanged?: () => void;
  // owner/admin: muestra "Exportar Excel" en la lista de asistentes.
  canExportAttendees?: boolean;
}

export function ActivityDetailDrawer({ activity, onClose, onEdit, onChanged, canExportAttendees = false }: ActivityDetailDrawerProps) {
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const open = activity !== null;
  // Snapshot del último activity no-nulo: se retiene durante la animación de salida.
  const shownRef = useRef(activity);
  if (activity) shownRef.current = activity;
  const shown = shownRef.current;

  // Detalle completo (Lifecycle A2): el listado no proyecta `description`. Para
  // items REALES (statusRaw) lo traemos bajo demanda y lo mostramos con estado
  // honesto (loading/dato/error), sin bloquear el resto del detalle.
  const realId = activity?.statusRaw ? activity.id : null;
  const [desc, setDesc] = useState<{ phase: 'loading' | 'ready' | 'error'; text: string | null }>({ phase: 'loading', text: null });
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [summaryKey, setSummaryKey] = useState(0); // bump al quitar asistencias
  // RSVP (S3): panel de invitar; el seguimiento vive en InvitationsSection
  // (invKey lo refresca tras enviar un lote).
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteProtoOpen, setInviteProtoOpen] = useState(false);
  const [importGuestsOpen, setImportGuestsOpen] = useState(false);
  const [invKey, setInvKey] = useState(0);
  useEffect(() => {
    if (!realId) return;
    let ignore = false;
    setDesc({ phase: 'loading', text: null });
    setSummary(null);
    void fetchActivityDetail(realId).then((r) => {
      if (ignore) return;
      if (r.ok) setDesc({ phase: 'ready', text: r.detail.description });
      else setDesc({ phase: 'error', text: null });
    });
    // Resumen en paralelo; null (error/sin datos) → la sección no se muestra.
    void fetchActivitySummary(realId).then((sum) => { if (!ignore) setSummary(sum); });
    return () => { ignore = true; };
  }, [realId, summaryKey]);

  // Cierre animado (scroll-lock/Escape/foco-restore los maneja el hook).
  const { mounted, closing, panelRef } = useDrawerLifecycle({ open, onEscape: onClose });
  // Foco inicial al contenedor del diálogo al abrir.
  useEffect(() => { if (mounted) containerRef.current?.focus(); }, [mounted]);

  if (!mounted || !shown) return null;

  return (
    <div
      ref={containerRef}
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
        className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')}
      />
      {/* Panel: bottom-sheet en mobile, lateral derecho en md+ */}
      <div
        ref={panelRef}
        className={cn(
          'drawer-panel absolute inset-x-0 bottom-0 max-h-[88dvh] md:max-h-none rounded-t-2xl border-t border-line bg-surface shadow-xl',
          'md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-full md:max-w-xl lg:max-w-2xl md:rounded-none md:border-l md:border-t-0',
          'flex flex-col',
          closing && 'drawer-panel--closing',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Detalle de actividad</p>
            <h2 id={titleId} className="mt-1 text-lg font-bold leading-tight tracking-tight text-ink">{shown.title}</h2>
          </div>
          <IconButton label="Cerrar detalle" variant="outline" size="sm" onClick={onClose}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Portada 16:9 (fallback si no hay imagen) */}
          <div className="mb-4 aspect-video w-full overflow-hidden rounded-xl bg-surface-container">
            <CoverThumb
              src={shown.imageUrl ?? null}
              posY={shown.imagePosY}
              alt=""
              className="h-full w-full object-cover"
              fallback={
                <div className="grid h-full w-full place-items-center text-faint">
                  <ImageOff size={28} strokeWidth={1.5} aria-hidden="true" />
                </div>
              }
            />
          </div>
          <div className="mb-4"><StatusBadge status={shown.status} label={shown.statusLabel} /></div>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Row icon={CalendarDays} label="Fecha">{shown.date}</Row>
            <Row icon={MapPin} label="Lugar">{shown.location}</Row>
            <Row icon={Tag} label="Categoría">{shown.category}</Row>
            <Row icon={Users} label="Ocupación">
              {shown.occupancyPct === null
                ? <span className="text-faint">Sin datos</span>
                : <span className="tabular-nums">{shown.registered} / {shown.capacity} <span className="text-faint">· {shown.occupancyPct}%</span></span>}
            </Row>
          </dl>

          {shown.occupancyPct !== null ? (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
                <div className="h-full rounded-full bg-brand" style={{ width: `${shown.occupancyPct}%` }} />
              </div>
            </div>
          ) : null}

          {/* Resumen post-evento / en vivo (paridad v1) · sólo con asistencias. */}
          {shown.statusRaw && summary && summary.totalAttendances > 0 ? (
            <div className="mt-6">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                <BarChart3 size={13} strokeWidth={1.75} aria-hidden="true" />
                {shown.statusRaw === 'finalizada' ? 'Resumen post-evento' : 'Resumen en vivo'}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <StatTile
                  icon={Users}
                  label="Asistencias"
                  value={summary.totalAttendances}
                  extra={`${summary.occupancyPct}% ocupación${summary.anonymousCount > 0 ? ` · ${summary.anonymousCount} sin credencial` : ''}`}
                />
                {summary.companionsChildren > 0 ? (
                  <StatTile
                    icon={Baby}
                    label="Personas en sala"
                    value={summary.peopleInRoom}
                    extra={`Incluye ${summary.companionsChildren} niño${summary.companionsChildren === 1 ? '' : 's'} acompañante${summary.companionsChildren === 1 ? '' : 's'}`}
                  />
                ) : null}
                <StatTile
                  icon={Sparkles}
                  label="Nuevos visitantes"
                  value={summary.newcomers}
                  extra={summary.identifiedCount > 0 ? `${summary.newcomerRatio}% de ${summary.identifiedCount} identificado${summary.identifiedCount === 1 ? '' : 's'}` : 'Sin identificados'}
                />
                <StatTile
                  icon={Repeat2}
                  label="Habituales"
                  value={summary.returning}
                  extra={`Prom. ${summary.avgPriorAttendances} visitas previas`}
                />
                <StatTile
                  icon={Crown}
                  label="VIPs presentes"
                  value={summary.vipCount}
                  extra="≥10 visitas totales"
                />
                {summary.anonymousCount > 0 ? (
                  <StatTile
                    icon={UserPlus}
                    label="Sin credencial"
                    value={summary.anonymousCount}
                    extra="Walk-ins registrados manualmente"
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Asistentes (paridad v1 attendees, con perfil editable) · solo reales */}
          {shown.statusRaw ? (
            <AttendeesSection activityId={shown.id} canExport={canExportAttendees} onMutated={() => setSummaryKey((k) => k + 1)} />
          ) : null}

          {/* Invitaciones RSVP (S3) · resumen + lista con cancelar (PR-3) */}
          {shown.statusRaw ? (
            <InvitationsSection activityId={shown.id} canManage={canExportAttendees} refreshKey={invKey} />
          ) : null}

          {/* Descripción · del detalle completo (Lifecycle A2). Estado honesto. */}
          {shown.statusRaw ? (
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
        {shown.statusRaw && (onEdit || onChanged) ? (
          // Primarias visibles (Invitar audiencia + Editar); Finalizar/Cancelar/
          // Reactivar plegadas en el menú ⋯ para no saturar el pie.
          <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
            {canExportAttendees && shown.statusRaw === 'activa' ? (
              <span className="mr-auto flex flex-1 gap-2 sm:flex-none">
                <Button type="button" className="flex-1 sm:flex-none" onClick={() => setInviteOpen(true)}
                  style={{ backgroundColor: 'var(--color-brand-accent)' }}>
                  <Megaphone size={16} strokeWidth={2} aria-hidden="true" /> Invitar audiencia
                </Button>
                <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={() => setInviteProtoOpen(true)}>
                  <Medal size={16} strokeWidth={2} aria-hidden="true" /> Protocolo
                </Button>
                <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={() => setImportGuestsOpen(true)}>
                  <Upload size={16} strokeWidth={2} aria-hidden="true" /> Importar lista
                </Button>
              </span>
            ) : null}
            {onEdit ? (
              <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={() => onEdit(shown)}>
                <Pencil size={16} strokeWidth={2} aria-hidden="true" /> Editar actividad
              </Button>
            ) : null}
            {onChanged ? (
              <StatusActionsMenu id={shown.id} statusRaw={shown.statusRaw} onChanged={onChanged} />
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

      {shown.statusRaw ? (
        <>
          <InviteAudiencePanel
            activityId={shown.id}
            activityName={shown.title}
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
            onSent={() => setInvKey((k) => k + 1)}
          />
          <InviteProtocolPanel
            activityId={shown.id}
            activityName={shown.title}
            open={inviteProtoOpen}
            onClose={() => setInviteProtoOpen(false)}
            onSent={() => setInvKey((k) => k + 1)}
          />
          <ImportGuestsPanel
            activityId={shown.id}
            activityName={shown.title}
            open={importGuestsOpen}
            onClose={() => setImportGuestsOpen(false)}
            onImported={() => setInvKey((k) => k + 1)}
          />
        </>
      ) : null}
    </div>
  );
}

// Tarjeta de métrica del resumen: número grande + label + sublínea honesta
// (los % de afinidad se leen contra IDENTIFICADOS, no contra el total).
function StatTile({ icon: Icon, label, value, extra }: { icon: typeof CalendarDays; label: string; value: number; extra: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-container/60 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">
        <Icon size={13} strokeWidth={1.75} aria-hidden="true" /> {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted">{extra}</p>
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
