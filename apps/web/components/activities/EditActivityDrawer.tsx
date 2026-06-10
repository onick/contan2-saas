'use client';

// apps/web/components/activities/EditActivityDrawer.tsx · edición de una actividad
// en el mismo shell de drawer accesible que NewActivityDrawer (role=dialog,
// aria-modal, Escape, foco inicial, scroll-lock, bottom-sheet/lateral). Lifecycle B.
//
// PRECARGA FULL-FIDELITY (Lifecycle A2): al abrir, hace GET del detalle completo
// (/app/actividades/api/[id] → api-v2 GET /:id) → precarga name/type/location/date/
// endDate/capacity/category/description REALES. Muestra loading mientras carga y un
// error honesto si falla; si el detalle no carga, NO se permite editar (sin form,
// sin submit). Reintentar no recrea nada (es sólo un GET).
//
// PATCH PARCIAL: compara el form actual contra el inicial (cargado del detalle) y
// envía ÚNICAMENTE lo modificado, en forma de contrato (datetime-local → ISO,
// capacity → number, vacío→null donde el contrato lo permite). NUNCA envía
// organizationId/enrolledCount/imageUrl/status. api-v2 es la autoridad.
//
// PORTADA: se muestra la actual y se puede REEMPLAZAR (optimizeCover → POST
// multipart /api/[id]/cover, mismo pipeline que el alta) y AJUSTAR el encuadre
// vertical (slider 0–100 → imagePosY en el PATCH; preview en vivo). Al guardar:
// 1º sube la portada nueva (si hay), 2º PATCH con los campos dirty; si un paso
// falla, se reporta y el drawer queda abierto sin perder datos.
//
// UX: durante submitting no se puede cerrar ni re-enviar (no duplica PATCH). Si
// falla, se conservan los datos y el drawer queda abierto. En 200: onSaved().

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertTriangle, ImagePlus, RefreshCw, Sparkles } from 'lucide-react';
import { ActivityUpdateRequestSchema, ACTIVITY_TYPES, type ActivityDetail } from '@contan2/contracts';
import type { ZodIssue } from 'zod';
import type { Activity } from '../../lib/activities/demoData';
import { fetchActivityDetail } from '../../lib/api/activity-detail';
import { TYPE_LABELS } from '../../lib/activities/typeLabels';
import { optimizeCover, OptimizeError, formatBytes, type OptimizeResult } from '../../lib/images/optimizeCover';
import { CoverReframe } from './CoverReframe';
import { IconButton, Button, cn, focusRing, useDrawerLifecycle } from '../ui';

const ACCEPT = 'image/jpeg,image/png,image/webp';

// Portada en edición: 'keep' = no tocar la actual; 'optimizing' mientras se
// procesa una nueva; 'ready' = nueva imagen lista para subir al guardar.
type CoverState =
  | { phase: 'keep' }
  | { phase: 'optimizing' }
  | { phase: 'ready'; result: OptimizeResult; previewUrl: string; filename: string };



interface FormState {
  name: string; type: string; location: string; date: string;
  endDate: string; capacity: string; category: string; description: string;
}
type FieldKey = keyof FormState;
type Errors = Partial<Record<FieldKey | '_form', string>>;
const EMPTY: FormState = { name: '', type: '', location: '', date: '', endDate: '', capacity: '', category: '', description: '' };

// ISO → "YYYY-MM-DDTHH:mm" en hora LOCAL (lo que espera datetime-local).
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
// datetime-local → ISO UTC. null si vacío/ inválido.
function toIso(value: string): string | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Precarga full-fidelity desde el detalle completo (incluye endDate + description).
function formFromDetail(d: ActivityDetail): FormState {
  return {
    name: d.name,
    type: d.type,
    location: d.location,
    date: isoToLocalInput(d.date),
    endDate: isoToLocalInput(d.endDate),
    capacity: String(d.capacity),
    category: d.category ?? '',
    description: d.description ?? '',
  };
}

function friendly(issue: ZodIssue): string {
  switch (issue.code) {
    case 'too_small': return issue.type === 'string' ? `Mínimo ${issue.minimum} caracteres` : `Mínimo ${issue.minimum}`;
    case 'too_big': return issue.type === 'string' ? `Máximo ${issue.maximum} caracteres` : `Máximo ${issue.maximum}`;
    case 'invalid_enum_value': return 'Seleccioná una opción válida';
    case 'invalid_type': return 'Requerido';
    default: return issue.message;
  }
}

function serverMessage(status: number, body: { error?: string } | null): string {
  switch (status) {
    case 401: return 'Tu sesión expiró. Iniciá sesión de nuevo.';
    case 403: return 'No tenés permiso para editar actividades.';
    case 404: return 'La actividad ya no existe o no pertenece a este centro.';
    case 409: return body?.error ?? 'La capacidad no puede ser menor que la cantidad de inscritos.';
    case 400: return body?.error ?? 'Revisá los datos del formulario.';
    case 502: return body?.error ?? 'Problema de red. Reintentá.';
    default: return 'No pudimos guardar los cambios. Intentá de nuevo.';
  }
}

export interface EditActivityDrawerProps {
  activity: Activity | null;
  onClose: () => void;
  onSaved: () => void; // 200 → el contenedor cierra + router.refresh()
}

export function EditActivityDrawer({ activity, onClose, onSaved }: EditActivityDrawerProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const noticeId = `${baseId}-notice`;
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const open = activity !== null;
  const activityId = activity?.id ?? null;
  // Snapshot del último activity no-nulo: se retiene durante la animación de salida
  // (activity ya es null) para que el encabezado no parpadee/crashee al cerrar.
  const shownRef = useRef(activity);
  if (activity) shownRef.current = activity;
  const shown = shownRef.current;

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<ActivityDetail | null>(null);
  const [initial, setInitial] = useState<FormState>(EMPTY);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [cover, setCover] = useState<CoverState>({ phase: 'keep' });
  const [coverErr, setCoverErr] = useState<string | null>(null);
  const [posY, setPosY] = useState(50);
  const [initialPosY, setInitialPosY] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);
  // previewUrl de la última portada YA subida con éxito: si el PATCH posterior
  // falla y el usuario reintenta, no se re-sube el mismo archivo.
  const uploadedCoverRef = useRef<string | null>(null);

  // Revoca el object URL del preview de la portada nueva al reemplazar/desmontar.
  const previewUrlRef = useRef<string | null>(null);
  const setPreview = (url: string | null) => {
    if (previewUrlRef.current && previewUrlRef.current !== url) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
  };
  useEffect(() => () => setPreview(null), []);

  // Carga (o recarga) el detalle. Sólo un GET → reintentar no recrea nada. Guarda
  // contra carrera: si la actividad objetivo cambió, descarta el resultado.
  const load = useCallback(async () => {
    if (!activityId) return;
    setPhase('loading'); setDetailError(null); setErrors({}); setBusy(false);
    setCover({ phase: 'keep' }); setCoverErr(null); setPreview(null);
    uploadedCoverRef.current = null;
    const r = await fetchActivityDetail(activityId);
    if (activityId !== (activity?.id ?? null)) return; // stale
    if (r.ok) {
      const f = formFromDetail(r.detail);
      const p = r.detail.imagePosY ?? 50;
      setPosY(p); setInitialPosY(p);
      setLoaded(r.detail); setInitial(f); setForm(f); setPhase('ready');
    } else {
      setDetailError(r.error); setPhase('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  useEffect(() => { if (activityId) void load(); }, [activityId, load]);
  // Foco al primer campo cuando el form queda listo.
  useEffect(() => { if (phase === 'ready') firstFieldRef.current?.focus(); }, [phase]);

  const busyRef = useRef(busy); busyRef.current = busy;
  const requestClose = useRef(() => {});
  requestClose.current = () => { if (!busyRef.current) onClose(); };

  // Cierre animado (scroll-lock/Escape/foco los maneja el hook).
  const { mounted, closing, panelRef } = useDrawerLifecycle({
    open, onEscape: () => requestClose.current(),
  });

  // Campos modificados (por string de form, robusto al round-trip de fechas).
  const dirty = useMemo(() => {
    const keys: FieldKey[] = ['name', 'type', 'location', 'date', 'endDate', 'capacity', 'category', 'description'];
    return keys.filter((k) => form[k] !== initial[k]);
  }, [form, initial]);
  const coverChanged = cover.phase === 'ready';
  const posYChanged = posY !== initialPosY;
  const hasChanges = dirty.length > 0 || coverChanged || posYChanged;

  if (!mounted || typeof document === 'undefined') return null;

  const set = (key: FieldKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] || e._form ? { ...e, [key]: undefined, _form: undefined } : e));
  };

  async function handleCover(file: File | null) {
    setCoverErr(null);
    if (!file) return;
    setCover({ phase: 'optimizing' });
    try {
      const result = await optimizeCover(file);
      const url = URL.createObjectURL(result.blob);
      setPreview(url);
      setCover({ phase: 'ready', result, previewUrl: url, filename: result.optimized ? 'cover.webp' : (file.name || 'cover') });
    } catch (e) {
      setPreview(null);
      setCover({ phase: 'keep' }); // conserva la portada actual
      setCoverErr(e instanceof OptimizeError ? e.message : 'No pudimos procesar la imagen.');
    }
  }
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleCover(e.target.files?.[0] ?? null);
    if (fileRef.current) fileRef.current.value = '';
  };

  // Body PARCIAL (sólo dirty) + validación de contrato. Cross-checks de cliente:
  // endDate>=date y fecha no-pasada si la actividad está activa (paridad api-v2),
  // usando los valores reales del detalle cargado como base.
  function build(): { ok: true; body: Record<string, unknown> } | { ok: false; errors: Errors } {
    const fe: Errors = {};
    const body: Record<string, unknown> = {};

    if (dirty.includes('name')) body.name = form.name.trim();
    if (dirty.includes('type')) { if (!form.type) fe.type = 'Seleccioná un tipo'; else body.type = form.type; }
    if (dirty.includes('location')) body.location = form.location.trim();
    if (dirty.includes('date')) {
      if (!form.date) fe.date = 'Requerido';
      else { const iso = toIso(form.date); if (!iso) fe.date = 'Fecha inválida'; else body.date = iso; }
    }
    if (dirty.includes('endDate')) {
      if (!form.endDate) body.endDate = null;
      else { const iso = toIso(form.endDate); if (!iso) fe.endDate = 'Fecha inválida'; else body.endDate = iso; }
    }
    if (dirty.includes('capacity')) {
      const n = Number(form.capacity);
      if (form.capacity.trim() === '' || !Number.isInteger(n)) fe.capacity = 'Número entero';
      else body.capacity = n;
    }
    if (dirty.includes('description')) body.description = form.description.trim();
    if (dirty.includes('category')) { const c = form.category.trim(); body.category = c === '' ? null : c; }
    if (posYChanged) body.imagePosY = posY;

    const effDate = (body.date as string | undefined) ?? loaded?.date ?? undefined;
    const effEnd = (body.endDate as string | null | undefined) ?? (dirty.includes('endDate') ? undefined : loaded?.endDate);
    if (effEnd && effDate && new Date(effEnd).getTime() < new Date(effDate).getTime()) {
      fe.endDate = 'Debe ser igual o posterior a la fecha de inicio.';
    }
    if (body.date && loaded?.status === 'activa' && new Date(body.date as string).getTime() < Date.now() - 60_000) {
      fe.date = 'La fecha debe ser presente o futura.';
    }

    const parsed = ActivityUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const k = issue.path[0];
        if (typeof k === 'string' && !fe[k as FieldKey]) fe[k as FieldKey] = friendly(issue);
      }
    }
    if (Object.keys(fe).length > 0) return { ok: false, errors: fe };
    return { ok: true, body };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !activity || phase !== 'ready') return;
    if (!hasChanges) { setErrors({ _form: 'No hay cambios para guardar.' }); return; }
    setErrors({}); setCoverErr(null);
    const v = build();
    if (!v.ok) { setErrors(v.errors); return; }

    setBusy(true);

    // 1º · portada nueva (si hay): mismo pipeline que el alta (multipart → cover).
    if (cover.phase === 'ready' && uploadedCoverRef.current !== cover.previewUrl) {
      let up: Response;
      try {
        const fd = new FormData();
        fd.append('cover', cover.result.blob, cover.filename);
        up = await fetch(`/app/actividades/api/${encodeURIComponent(activity.id)}/cover`, { method: 'POST', body: fd });
      } catch {
        setBusy(false);
        setCoverErr('Problema de red al subir la portada. Reintentá.');
        return;
      }
      if (!up.ok) {
        setBusy(false);
        let body: { error?: string } | null = null;
        try { body = (await up.json()) as { error?: string }; } catch { /* sin JSON */ }
        setCoverErr(body?.error ?? 'No pudimos subir la portada. Intentá de nuevo.');
        return;
      }
      uploadedCoverRef.current = cover.previewUrl; // no re-subir si el PATCH falla
    }

    // 2º · PATCH parcial (si quedó algo que mandar). Si sólo cambió la portada, listo.
    if (Object.keys(v.body).length === 0) { setBusy(false); onSaved(); return; }

    let res: Response;
    try {
      res = await fetch(`/app/actividades/api/${encodeURIComponent(activity.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(v.body),
      });
    } catch {
      setBusy(false);
      setErrors({ _form: 'Problema de red. Revisá tu conexión e intentá de nuevo.' });
      return;
    }

    if (res.status === 200) { setBusy(false); onSaved(); return; }

    setBusy(false);
    type ErrBody = { error?: string; issues?: Array<{ path?: unknown[]; message?: string }> };
    let body: ErrBody | null = null;
    try { body = (await res.json()) as ErrBody; } catch { /* sin JSON */ }
    if (res.status === 400 && body && Array.isArray(body.issues) && body.issues.length > 0) {
      const fe: Errors = {};
      for (const it of body.issues) {
        const k = Array.isArray(it.path) ? it.path[0] : undefined;
        if (typeof k === 'string' && it.message) fe[k as FieldKey] = it.message;
      }
      setErrors(Object.keys(fe).length ? fe : { _form: serverMessage(400, body) });
    } else {
      setErrors({ _form: serverMessage(res.status, body) });
    }
  }

  const inputCls = (hasErr: boolean) =>
    cn('mt-1 min-h-11 w-full rounded-lg border bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing, hasErr ? 'border-danger-fg' : 'border-line');
  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';
  const errId = (k: FieldKey) => `${baseId}-${k}-err`;
  const FieldError = ({ k }: { k: FieldKey }) =>
    errors[k] ? <span id={errId(k)} className="mt-1 block text-xs text-danger-fg">{errors[k]}</span> : null;

  return createPortal(
    <div tabIndex={-1} className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => requestClose.current()}
        className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')} />
      <div ref={panelRef} className={cn(
        'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] md:max-h-none rounded-t-2xl border-t border-line bg-surface shadow-xl',
        'md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-full md:max-w-lg md:rounded-none md:border-l md:border-t-0',
        'flex flex-col', closing && 'drawer-panel--closing')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className={labelCls}>Editar actividad</p>
            <h2 id={titleId} className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-ink">{shown?.title}</h2>
          </div>
          <IconButton label="Cerrar" variant="outline" size="sm" onClick={() => requestClose.current()} disabled={busy}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        {/* LOADING: detalle en camino. */}
        {phase === 'loading' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-12 text-muted" aria-busy="true">
            <Loader2 size={22} strokeWidth={2.25} aria-hidden="true" className="animate-spin" />
            <p className="text-[13px]">Cargando actividad…</p>
          </div>
        ) : phase === 'error' ? (
          /* ERROR: detalle no cargó → NO se permite editar. Reintentar sólo reintenta el GET. */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <AlertTriangle size={24} strokeWidth={2} aria-hidden="true" className="text-danger-fg" />
            <p role="alert" className="text-[13px] text-muted">{detailError ?? 'No pudimos cargar la actividad.'}</p>
            <div className="mt-1 flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => requestClose.current()}>Cerrar</Button>
              <Button type="button" onClick={() => void load()}>Reintentar</Button>
            </div>
          </div>
        ) : (
          /* READY: form precargado con valores reales. */
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {errors._form ? (
                <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{errors._form}</p>
              ) : null}

              <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" aria-hidden="true" tabIndex={-1} onChange={onFileChange} disabled={busy} />

              {/* PORTADA · actual o nueva, con encuadre vertical en vivo */}
              <div className="block">
                <span id={`${baseId}-cover-label`} className={labelCls}>Portada</span>

                {cover.phase === 'optimizing' ? (
                  <div className="mt-1 flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface-container text-muted" aria-busy="true">
                    <Loader2 size={20} strokeWidth={2.25} aria-hidden="true" className="animate-spin" />
                    <span className="text-[13px]">Optimizando imagen…</span>
                  </div>
                ) : cover.phase === 'ready' || loaded?.imageUrl ? (
                  <div className="mt-1">
                    <CoverReframe
                      src={cover.phase === 'ready' ? cover.previewUrl : loaded!.imageUrl!}
                      posY={posY}
                      onChange={setPosY}
                      disabled={busy}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                        className={cn('inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink disabled:opacity-50', focusRing)}>
                        <RefreshCw size={14} strokeWidth={2} aria-hidden="true" /> Cambiar portada
                      </button>
                      {cover.phase === 'ready' ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-success-fg">
                          <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
                          Nueva portada lista · {formatBytes(cover.result.finalSize)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <button type="button" disabled={busy} aria-labelledby={`${baseId}-cover-label`} onClick={() => fileRef.current?.click()}
                    className={cn('mt-1 flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line bg-surface text-center transition-colors hover:bg-surface-container disabled:opacity-50', focusRing)}>
                    <ImagePlus size={22} strokeWidth={1.75} aria-hidden="true" className="text-faint" />
                    <span className="text-[13px] font-medium text-muted">Esta actividad no tiene portada · tocá para agregar una</span>
                    <span className="text-[11px] text-faint">JPEG, PNG o WebP · se optimiza automáticamente</span>
                  </button>
                )}
                {coverErr ? (
                  <span role="alert" className="mt-1 flex items-center gap-1.5 text-xs text-danger-fg">
                    <AlertTriangle size={13} strokeWidth={2} aria-hidden="true" /> {coverErr}
                  </span>
                ) : null}
              </div>

              <fieldset disabled={busy} className="m-0 min-w-0 space-y-4 border-0 p-0">
                <label className="block">
                  <span className={labelCls}>Nombre</span>
                  <input ref={firstFieldRef} type="text" value={form.name} onChange={(e) => set('name', e.target.value)}
                    aria-invalid={!!errors.name} aria-describedby={errors.name ? errId('name') : undefined} className={inputCls(!!errors.name)} />
                  <FieldError k="name" />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelCls}>Tipo</span>
                    <select value={form.type} onChange={(e) => set('type', e.target.value)}
                      aria-invalid={!!errors.type} aria-describedby={errors.type ? errId('type') : undefined} className={inputCls(!!errors.type)}>
                      <option value="" disabled>Seleccioná…</option>
                      {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}
                    </select>
                    <FieldError k="type" />
                  </label>
                  <label className="block">
                    <span className={labelCls}>Capacidad</span>
                    <input type="number" min={1} max={10000} step={1} value={form.capacity} onChange={(e) => set('capacity', e.target.value)}
                      aria-invalid={!!errors.capacity} aria-describedby={errors.capacity ? errId('capacity') : undefined} className={cn(inputCls(!!errors.capacity), 'tabular-nums')} />
                    <FieldError k="capacity" />
                  </label>
                </div>

                <label className="block">
                  <span className={labelCls}>Lugar</span>
                  <input type="text" value={form.location} onChange={(e) => set('location', e.target.value)}
                    aria-invalid={!!errors.location} aria-describedby={errors.location ? errId('location') : undefined} className={inputCls(!!errors.location)} />
                  <FieldError k="location" />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelCls}>Fecha y hora</span>
                    <input type="datetime-local" value={form.date} onChange={(e) => set('date', e.target.value)}
                      aria-invalid={!!errors.date} aria-describedby={errors.date ? errId('date') : undefined} className={inputCls(!!errors.date)} />
                    <FieldError k="date" />
                  </label>
                  <label className="block">
                    <span className={labelCls}>Cierre <span className="normal-case text-faint">(opcional)</span></span>
                    <input type="datetime-local" value={form.endDate} onChange={(e) => set('endDate', e.target.value)}
                      aria-invalid={!!errors.endDate} aria-describedby={errors.endDate ? errId('endDate') : undefined} className={inputCls(!!errors.endDate)} />
                    <FieldError k="endDate" />
                  </label>
                </div>

                <label className="block">
                  <span className={labelCls}>Categoría <span className="normal-case text-faint">(opcional)</span></span>
                  <input type="text" value={form.category} onChange={(e) => set('category', e.target.value)}
                    aria-invalid={!!errors.category} aria-describedby={errors.category ? errId('category') : undefined} className={inputCls(!!errors.category)} />
                  <FieldError k="category" />
                </label>

                <label className="block">
                  <span className={labelCls}>Descripción <span className="normal-case text-faint">(opcional)</span></span>
                  <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3}
                    aria-invalid={!!errors.description} aria-describedby={errors.description ? errId('description') : undefined}
                    className={cn('mt-1 min-h-[88px] w-full rounded-lg border bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing, errors.description ? 'border-danger-fg' : 'border-line')} />
                  <FieldError k="description" />
                </label>
              </fieldset>
            </div>

            <footer className="border-t border-line px-5 py-4">
              <p id={noticeId} className="mb-3 text-[12px] text-faint">
                Se guardan <strong className="font-semibold text-muted">sólo los campos que modifiques</strong>.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => requestClose.current()} disabled={busy}>Cancelar</Button>
                <Button type="submit" disabled={busy || !hasChanges} aria-describedby={noticeId}>
                  {busy ? (<><Loader2 size={16} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Guardando…</>) : 'Guardar cambios'}
                </Button>
              </div>
            </footer>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
