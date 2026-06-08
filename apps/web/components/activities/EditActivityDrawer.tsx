'use client';

// apps/web/components/activities/EditActivityDrawer.tsx · edición de una actividad
// en el mismo shell de drawer accesible que NewActivityDrawer (role=dialog,
// aria-modal, Escape, foco inicial, scroll-lock, bottom-sheet/lateral). Lifecycle B.
//
// PRECARGA: name/type/location/date/capacity/category vienen del listado real
// (ActivityListItem). endDate y description NO los proyecta el listado → quedan
// vacíos con ayuda explícita; sólo se envían si el usuario los edita.
//
// PATCH PARCIAL: se compara el form actual contra el inicial (por string) y se
// envía ÚNICAMENTE lo modificado, convertido a la forma del contrato (datetime-
// local → ISO, capacity → number, vacío→null donde el contrato lo permite). NUNCA
// se envía organizationId/enrolledCount/imageUrl/status (el contrato .strict los
// rechazaría). api-v2 es la autoridad (rol, 409 capacidad, 400 fechas, 404 tenant).
//
// UX: durante submitting no se puede cerrar ni re-enviar (no duplica PATCH). Si
// falla, se conservan los datos y el drawer queda abierto. En 200: onSaved().

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { ActivityUpdateRequestSchema, ACTIVITY_TYPES } from '@contan2/contracts';
import type { ZodIssue } from 'zod';
import type { Activity } from '../../lib/activities/demoData';
import { IconButton, Button, cn, focusRing } from '../ui';

const TYPE_LABELS: Record<string, string> = {
  exposicion: 'Exposición', concierto: 'Concierto', cine: 'Cine', taller: 'Taller',
  teatro: 'Teatro', conferencia: 'Conferencia', otro: 'Otro',
};

interface FormState {
  name: string; type: string; location: string; date: string;
  endDate: string; capacity: string; category: string; description: string;
}
type FieldKey = keyof FormState;
type Errors = Partial<Record<FieldKey | '_form', string>>;

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

function initialFrom(a: Activity): FormState {
  return {
    name: a.title ?? '',
    type: a.type ?? '',
    location: a.location ?? '',
    date: isoToLocalInput(a.startsAt),
    endDate: '', // no proyectado por el listado
    capacity: a.capacity != null ? String(a.capacity) : '',
    category: a.category && a.category !== 'Otro' ? a.category : (a.category ?? ''),
    description: '', // no proyectado por el listado
  };
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
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const open = activity !== null;

  const initial = useMemo<FormState>(() => (activity ? initialFrom(activity) : {
    name: '', type: '', location: '', date: '', endDate: '', capacity: '', category: '', description: '',
  }), [activity]);

  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  // Re-precargar cuando cambia la actividad objetivo.
  useEffect(() => { setForm(initial); setErrors({}); setBusy(false); }, [initial]);

  const busyRef = useRef(busy); busyRef.current = busy;
  const requestClose = useRef(() => {});
  requestClose.current = () => { if (!busyRef.current) onClose(); };

  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstFieldRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open]);

  // Campos modificados (por string de form, robusto al round-trip de fechas).
  const dirty = useMemo(() => {
    const keys: FieldKey[] = ['name', 'type', 'location', 'date', 'endDate', 'capacity', 'category', 'description'];
    return keys.filter((k) => form[k] !== initial[k]);
  }, [form, initial]);

  if (!open || typeof document === 'undefined') return null;

  const set = (key: FieldKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] || e._form ? { ...e, [key]: undefined, _form: undefined } : e));
  };

  // Construye el body PARCIAL (sólo dirty) + valida con el contrato. Devuelve el
  // body o errores por campo. Cross-checks de cliente: endDate>=date (si ambos en
  // el form) y fecha no-pasada si la actividad está activa (paridad con api-v2).
  function build(): { ok: true; body: Record<string, unknown> } | { ok: false; errors: Errors } {
    const fe: Errors = {};
    const body: Record<string, unknown> = {};

    if (dirty.includes('name')) body.name = form.name.trim();
    if (dirty.includes('type')) {
      if (!form.type) fe.type = 'Seleccioná un tipo'; else body.type = form.type;
    }
    if (dirty.includes('location')) body.location = form.location.trim();

    let dateIso: string | undefined;
    if (dirty.includes('date')) {
      if (!form.date) fe.date = 'Requerido';
      else { const iso = toIso(form.date); if (!iso) fe.date = 'Fecha inválida'; else { dateIso = iso; body.date = iso; } }
    }
    if (dirty.includes('endDate')) {
      if (!form.endDate) body.endDate = null; // limpiar
      else { const iso = toIso(form.endDate); if (!iso) fe.endDate = 'Fecha inválida'; else body.endDate = iso; }
    }
    if (dirty.includes('capacity')) {
      const n = Number(form.capacity);
      if (form.capacity.trim() === '' || !Number.isInteger(n)) fe.capacity = 'Número entero';
      else body.capacity = n;
    }
    if (dirty.includes('description')) body.description = form.description.trim();
    if (dirty.includes('category')) {
      const c = form.category.trim();
      body.category = c === '' ? null : c;
    }

    // Cross-checks de cliente (api-v2 vuelve a validar).
    const effDate = (body.date as string | undefined) ?? activity?.startsAt ?? undefined;
    const effEnd = body.endDate as string | null | undefined;
    if (effEnd && effDate && new Date(effEnd).getTime() < new Date(effDate).getTime()) {
      fe.endDate = 'Debe ser igual o posterior a la fecha de inicio.';
    }
    if (body.date && activity?.statusRaw === 'activa' && new Date(body.date as string).getTime() < Date.now() - 60_000) {
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
    if (busy || !activity) return;
    if (dirty.length === 0) { setErrors({ _form: 'No hay cambios para guardar.' }); return; }
    setErrors({});
    const v = build();
    if (!v.ok) { setErrors(v.errors); return; }

    setBusy(true);
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

    // Error: conservar datos, mostrar mensaje. 400 con issues → por campo.
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
    <div ref={panelRef} tabIndex={-1} className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => requestClose.current()}
        className="drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity" />
      <div className={cn(
        'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t border-line bg-surface shadow-xl',
        'md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-full md:max-w-lg md:rounded-none md:border-l md:border-t-0',
        'flex flex-col')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className={labelCls}>Editar actividad</p>
            <h2 id={titleId} className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-ink">{activity.title}</h2>
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
                <span className="mt-1 block text-[11px] text-faint">Se conserva el valor actual si lo dejás vacío.</span>
              </label>
            </fieldset>
          </div>

          <footer className="border-t border-line px-5 py-4">
            <p id={noticeId} className="mb-3 text-[12px] text-faint">
              Se guardan <strong className="font-semibold text-muted">sólo los campos que modifiques</strong>.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => requestClose.current()} disabled={busy}>Cancelar</Button>
              <Button type="submit" disabled={busy || dirty.length === 0} aria-describedby={noticeId}>
                {busy ? (<><Loader2 size={16} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Guardando…</>) : 'Guardar cambios'}
              </Button>
            </div>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
