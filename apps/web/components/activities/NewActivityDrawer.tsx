'use client';

// apps/web/components/activities/NewActivityDrawer.tsx · formulario "Nueva
// actividad" en un drawer accesible. PORTADA OBLIGATORIA: el admin v2 crea SIEMPRE
// con portada en UN solo request multipart atómico (POST /app/actividades/api/
// with-cover → api-v2 POST /activities/with-cover). Nunca crea sin portada; ya no
// existe el flujo "crear → subir portada" ni "Finalizar sin portada" ni éxito
// parcial. Un único éxito (201 → cierra/resetea/refresca) o fallo (conserva datos).
//
// PORTADA va PRIMERO (tras el header, antes de Nombre): preview 16:9, requerida,
// leyenda; las imágenes grandes se optimizan en el cliente (optimizeCover) a WebP
// <5 MB con alta calidad visual antes de enviarse. El servidor revalida/reencoda.
//
// Validación de campos: reutiliza ActivityCreateRequestSchema (bundle-safe). Fechas
// datetime-local → ISO. Anti-doble-submit. Recursos (object URLs) liberados.

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ImagePlus, RefreshCw, Sparkles, AlertTriangle } from 'lucide-react';
import { ActivityCreateRequestSchema, ACTIVITY_TYPES, type ActivityType } from '@contan2/contracts';
import type { ZodIssue } from 'zod';
import { optimizeCover, OptimizeError, formatBytes, type OptimizeResult } from '../../lib/images/optimizeCover';
import { IconButton, Button, cn, focusRing, useDrawerLifecycle } from '../ui';

const TYPE_LABELS: Record<ActivityType, string> = {
  exposicion: 'Exposición', concierto: 'Concierto', cine: 'Cine', taller: 'Taller',
  teatro: 'Teatro', conferencia: 'Conferencia', otro: 'Otro',
};
const ACCEPT = 'image/jpeg,image/png,image/webp';

interface FormState { name: string; type: string; location: string; date: string; endDate: string; capacity: string; category: string; description: string; }
const EMPTY: FormState = { name: '', type: '', location: '', date: '', endDate: '', capacity: '', category: '', description: '' };
type FieldKey = keyof FormState;
type Errors = Partial<Record<FieldKey | '_form', string>>;

function toIso(value: string): string | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
function friendly(issue: ZodIssue): string {
  switch (issue.code) {
    case 'too_small': return issue.type === 'string' ? `Mínimo ${issue.minimum} caracteres` : `Mínimo ${issue.minimum}`;
    case 'too_big': return issue.type === 'string' ? `Máximo ${issue.maximum} caracteres` : `Máximo ${issue.maximum}`;
    case 'invalid_enum_value': return 'Seleccioná una opción válida';
    case 'invalid_string': return 'Formato inválido';
    case 'invalid_type': return 'Requerido';
    default: return issue.message;
  }
}
function serverMessage(status: number, body: { error?: string } | null): string {
  switch (status) {
    case 401: return 'Tu sesión expiró. Iniciá sesión de nuevo.';
    case 403: return 'No tenés permiso para crear actividades.';
    case 413: return body?.error ?? 'La imagen supera el máximo de 5 MB.';
    case 415: return body?.error ?? 'Formato de imagen no permitido.';
    case 400: return body?.error ?? 'Revisá los datos del formulario.';
    case 502: return body?.error ?? 'Problema de red. Reintentá.';
    default: return 'No pudimos crear la actividad. Intentá de nuevo.';
  }
}

type CoverState =
  | { phase: 'empty' }
  | { phase: 'optimizing' }
  | { phase: 'ready'; result: OptimizeResult; previewUrl: string; filename: string };

export interface NewActivityDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void; // 201 → el contenedor cierra y ejecuta router.refresh()
}

export function NewActivityDrawer({ open, onClose, onCreated }: NewActivityDrawerProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const noticeId = `${baseId}-notice`;
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [cover, setCover] = useState<CoverState>({ phase: 'empty' });
  const [coverErr, setCoverErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Revoca el object URL del preview al reemplazarlo o desmontar.
  const previewUrlRef = useRef<string | null>(null);
  const setPreview = (url: string | null) => {
    if (previewUrlRef.current && previewUrlRef.current !== url) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
  };

  const reset = () => {
    setForm(EMPTY); setErrors({}); setBusy(false); setCoverErr(null);
    setPreview(null); setCover({ phase: 'empty' });
  };
  // Éxito (201): el padre cierra (open→false) y el reset/liberación del object URL
  // corre al final de la animación de salida (onClosed), no a mitad del slide.
  const success = () => { onCreated(); };

  const busyRef = useRef(busy); busyRef.current = busy;
  const requestClose = useRef(() => {});
  requestClose.current = () => { if (busyRef.current) return; onClose(); };

  // Cierre animado: el reset (incl. revoke del preview) corre al final.
  const { mounted, closing, panelRef } = useDrawerLifecycle({
    open, onEscape: () => requestClose.current(), onClosed: reset,
  });
  // Liberar el preview al desmontar el componente (red de seguridad).
  useEffect(() => () => setPreview(null), []);

  if (!mounted || typeof document === 'undefined') return null;

  const set = (key: FieldKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] || e._form ? { ...e, [key]: undefined, _form: undefined } : e));
  };

  async function handleCover(file: File | null) {
    setCoverErr(null);
    setErrors((e) => ({ ...e, _form: undefined }));
    if (!file) return;
    setCover({ phase: 'optimizing' });
    try {
      const result = await optimizeCover(file);
      const url = URL.createObjectURL(result.blob);
      setPreview(url);
      setCover({ phase: 'ready', result, previewUrl: url, filename: result.optimized ? 'cover.webp' : (file.name || 'cover') });
    } catch (e) {
      setPreview(null);
      const msg = e instanceof OptimizeError ? e.message : 'No pudimos procesar la imagen.';
      setCover({ phase: 'empty' }); // vuelve al dropzone para reintentar
      setCoverErr(msg); // mensaje accesible (role=alert)
    }
  }
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleCover(e.target.files?.[0] ?? null);
    if (fileRef.current) fileRef.current.value = ''; // permite re-elegir el mismo archivo
  };

  // Valida campos (sin portada) y devuelve los valores normalizados o errores.
  function validateFields(): { ok: true; fields: Record<string, string> } | { ok: false; errors: Errors } {
    const fe: Errors = {};
    if (!form.type) fe.type = 'Seleccioná un tipo';
    let dateIso: string | undefined;
    if (!form.date) fe.date = 'Requerido';
    else { const iso = toIso(form.date); if (!iso) fe.date = 'Fecha inválida'; else dateIso = iso; }
    let endIso: string | undefined;
    if (form.endDate) { const iso = toIso(form.endDate); if (!iso) fe.endDate = 'Fecha inválida'; else endIso = iso; }
    let capNum: number | undefined;
    if (form.capacity.trim() === '') fe.capacity = 'Requerido';
    else { const n = Number(form.capacity); if (!Number.isInteger(n)) fe.capacity = 'Número entero'; else capNum = n; }

    const candidate: Record<string, unknown> = {
      name: form.name.trim(), type: form.type, location: form.location.trim(),
      ...(dateIso ? { date: dateIso } : {}),
      ...(endIso ? { endDate: endIso } : {}),
      ...(capNum !== undefined ? { capacity: capNum } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(form.category.trim() ? { category: form.category.trim() } : {}),
    };
    const parsed = ActivityCreateRequestSchema.safeParse(candidate);
    if (!parsed.success) for (const issue of parsed.error.issues) { const k = issue.path[0]; if (typeof k === 'string' && !fe[k as FieldKey]) fe[k as FieldKey] = friendly(issue); }
    if (Object.keys(fe).length > 0) return { ok: false, errors: fe };

    const fields: Record<string, string> = {
      name: form.name.trim(), type: form.type, location: form.location.trim(),
      date: dateIso!, capacity: String(capNum),
    };
    if (endIso) fields.endDate = endIso;
    if (form.description.trim()) fields.description = form.description.trim();
    if (form.category.trim()) fields.category = form.category.trim();
    return { ok: true, fields };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErrors({});
    if (cover.phase !== 'ready') {
      setCoverErr('La portada es obligatoria.');
      return;
    }
    const v = validateFields();
    if (!v.ok) { setErrors(v.errors); return; }

    const fd = new FormData();
    for (const [k, val] of Object.entries(v.fields)) fd.append(k, val);
    fd.append('cover', cover.result.blob, cover.filename);

    setBusy(true);
    let res: Response;
    try {
      res = await fetch('/app/actividades/api/with-cover', { method: 'POST', body: fd });
    } catch {
      setBusy(false);
      setErrors({ _form: 'No pudimos crear la actividad. Revisá tu conexión e intentá de nuevo.' });
      return;
    }
    if (res.status === 201) { success(); return; }

    setBusy(false);
    type ErrBody = { error?: string; issues?: Array<{ path?: unknown[]; message?: string }> };
    let body: ErrBody | null = null;
    try { body = (await res.json()) as ErrBody; } catch { /* sin JSON */ }
    if (res.status === 400 && body && Array.isArray(body.issues) && body.issues.length > 0) {
      const fe: Errors = {};
      for (const it of body.issues) { const k = Array.isArray(it.path) ? it.path[0] : undefined; if (typeof k === 'string' && it.message) fe[k as FieldKey] = it.message; }
      setErrors(Object.keys(fe).length ? fe : { _form: serverMessage(400, body) });
    } else if (res.status === 413 || res.status === 415) {
      setCoverErr(serverMessage(res.status, body));
    } else {
      setErrors({ _form: serverMessage(res.status, body) });
    }
  }

  const inputCls = (hasErr: boolean) => cn('mt-1 min-h-11 w-full rounded-lg border bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing, hasErr ? 'border-danger-fg' : 'border-line');
  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';
  const errId = (k: FieldKey) => `${baseId}-${k}-err`;
  const FieldError = ({ k }: { k: FieldKey }) => errors[k] ? <span id={errId(k)} className="mt-1 block text-xs text-danger-fg">{errors[k]}</span> : null;

  const canSubmit = !busy && cover.phase === 'ready';

  return createPortal(
    <div tabIndex={-1} className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => requestClose.current()} className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')} />
      <div ref={panelRef} className={cn(
        'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] md:max-h-none rounded-t-2xl border-t border-line bg-surface shadow-xl',
        'md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-full md:max-w-lg md:rounded-none md:border-l md:border-t-0',
        'flex flex-col', closing && 'drawer-panel--closing')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className={labelCls}>Nueva actividad</p>
            <h2 id={titleId} className="mt-1 text-lg font-bold leading-tight tracking-tight text-ink">Crear actividad</h2>
          </div>
          <IconButton label="Cerrar" variant="outline" size="sm" onClick={() => requestClose.current()} disabled={busy}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {errors._form ? (
              <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{errors._form}</p>
            ) : null}

            <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" aria-hidden="true" tabIndex={-1} onChange={onFileChange} disabled={busy} />

            {/* PORTADA · primero, requerida */}
            <div className="block">
              <span id={`${baseId}-cover-label`} className={labelCls}>
                Portada <span className="text-danger-fg" aria-hidden="true">*</span>{' '}
                <span className="sr-only">(requerida)</span>
              </span>

              {cover.phase === 'ready' ? (
                <div className="mt-1">
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-surface-container">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cover.previewUrl} alt="Vista previa de la portada" className="h-full w-full object-cover" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={cn('inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink disabled:opacity-50', focusRing)}>
                      <RefreshCw size={14} strokeWidth={2} aria-hidden="true" /> Cambiar
                    </button>
                    {cover.result.optimized ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-success-fg">
                        <Sparkles size={13} strokeWidth={2} aria-hidden="true" /> Imagen optimizada con calidad visual alta
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-faint">
                    {cover.result.optimized
                      ? `Original ${formatBytes(cover.result.originalSize)} → optimizada ${formatBytes(cover.result.finalSize)}`
                      : `Imagen lista · ${formatBytes(cover.result.finalSize)}`}
                  </p>
                </div>
              ) : cover.phase === 'optimizing' ? (
                <div className="mt-1 flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface-container text-muted" aria-busy="true">
                  <Loader2 size={20} strokeWidth={2.25} aria-hidden="true" className="animate-spin" />
                  <span className="text-[13px]">Optimizando imagen…</span>
                </div>
              ) : (
                <button type="button" disabled={busy} aria-labelledby={`${baseId}-cover-label`} onClick={() => fileRef.current?.click()}
                  className={cn('mt-1 flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line bg-surface text-center transition-colors hover:bg-surface-container disabled:opacity-50', focusRing)}>
                  <ImagePlus size={22} strokeWidth={1.75} aria-hidden="true" className="text-faint" />
                  <span className="text-[13px] font-medium text-muted">Arrastrá una imagen o tocá para elegir</span>
                  <span className="text-[11px] text-faint">JPEG, PNG o WebP · las imágenes grandes se optimizan automáticamente</span>
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
                <input ref={firstFieldRef} type="text" value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? errId('name') : undefined} className={inputCls(!!errors.name)} placeholder="Ej: Concierto de apertura" />
                <FieldError k="name" />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelCls}>Tipo</span>
                  <select value={form.type} onChange={(e) => set('type', e.target.value)} aria-invalid={!!errors.type} aria-describedby={errors.type ? errId('type') : undefined} className={inputCls(!!errors.type)}>
                    <option value="" disabled>Seleccioná…</option>
                    {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                  <FieldError k="type" />
                </label>
                <label className="block">
                  <span className={labelCls}>Capacidad</span>
                  <input type="number" min={1} max={10000} step={1} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} aria-invalid={!!errors.capacity} aria-describedby={errors.capacity ? errId('capacity') : undefined} className={cn(inputCls(!!errors.capacity), 'tabular-nums')} placeholder="Ej: 120" />
                  <FieldError k="capacity" />
                </label>
              </div>

              <label className="block">
                <span className={labelCls}>Lugar</span>
                <input type="text" value={form.location} onChange={(e) => set('location', e.target.value)} aria-invalid={!!errors.location} aria-describedby={errors.location ? errId('location') : undefined} className={inputCls(!!errors.location)} placeholder="Ej: Sala principal" />
                <FieldError k="location" />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelCls}>Fecha y hora</span>
                  <input type="datetime-local" value={form.date} onChange={(e) => set('date', e.target.value)} aria-invalid={!!errors.date} aria-describedby={errors.date ? errId('date') : undefined} className={inputCls(!!errors.date)} />
                  <FieldError k="date" />
                </label>
                <label className="block">
                  <span className={labelCls}>Cierre <span className="normal-case text-faint">(opcional)</span></span>
                  <input type="datetime-local" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} aria-invalid={!!errors.endDate} aria-describedby={errors.endDate ? errId('endDate') : undefined} className={inputCls(!!errors.endDate)} />
                  <FieldError k="endDate" />
                </label>
              </div>

              <label className="block">
                <span className={labelCls}>Categoría <span className="normal-case text-faint">(opcional)</span></span>
                <input type="text" value={form.category} onChange={(e) => set('category', e.target.value)} aria-invalid={!!errors.category} aria-describedby={errors.category ? errId('category') : undefined} className={inputCls(!!errors.category)} placeholder="Ej: Ciclo de cine dominicano" />
                <FieldError k="category" />
              </label>

              <label className="block">
                <span className={labelCls}>Descripción <span className="normal-case text-faint">(opcional)</span></span>
                <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} aria-invalid={!!errors.description} aria-describedby={errors.description ? errId('description') : undefined}
                  className={cn('mt-1 min-h-[88px] w-full rounded-lg border bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing, errors.description ? 'border-danger-fg' : 'border-line')} placeholder="Detalles visibles para el equipo." />
                <FieldError k="description" />
              </label>
            </fieldset>
          </div>

          <footer className="border-t border-line px-5 py-4">
            <p id={noticeId} className="mb-3 text-[12px] text-faint">
              Al crear, la actividad se <strong className="font-semibold text-muted">publica de inmediato</strong> como activa, con su portada.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => requestClose.current()} disabled={busy}>Cancelar</Button>
              <Button type="submit" disabled={!canSubmit} aria-describedby={noticeId}>
                {busy ? (<><Loader2 size={16} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Creando actividad…</>) : 'Crear actividad'}
              </Button>
            </div>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
