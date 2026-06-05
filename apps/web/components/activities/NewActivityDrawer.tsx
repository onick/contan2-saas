'use client';

// apps/web/components/activities/NewActivityDrawer.tsx · formulario "Nueva
// actividad" en un drawer accesible (mismo shell que ActivityDetailDrawer:
// role=dialog + aria-modal, Escape, foco inicial + restauración, scroll-lock,
// bottom-sheet en mobile / lateral en md+).
//
// Validación: reutiliza ActivityCreateRequestSchema de @contan2/contracts (es
// bundle-safe: sólo importa zod) como ÚNICA fuente de reglas en cliente; el
// server vuelve a validar (fuente de verdad). Las fechas vienen de inputs
// datetime-local (hora LOCAL sin zona) → se convierten a ISO con
// new Date(value).toISOString() ANTES del POST, validando que no sean inválidas.
// endDate vacío se EXCLUYE del body (el contrato lo declara .optional(), no
// nullable). status e image_url NO se envían: el server fija status='activa'
// (se publica de inmediato) e image_url=null.
//
// UX: durante submitting no se puede cerrar ni re-enviar (no duplica POST). Si
// el POST falla, se conservan los datos y el drawer queda abierto. En 201:
// resetea, cierra y el contenedor llama router.refresh().

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { ActivityCreateRequestSchema, ACTIVITY_TYPES, type ActivityType } from '@contan2/contracts';
import type { ZodIssue } from 'zod';
import { IconButton, Button, cn, focusRing } from '../ui';
import { CoverDropzone } from './CoverDropzone';

const TYPE_LABELS: Record<ActivityType, string> = {
  exposicion: 'Exposición',
  concierto: 'Concierto',
  cine: 'Cine',
  taller: 'Taller',
  teatro: 'Teatro',
  conferencia: 'Conferencia',
  otro: 'Otro',
};

interface FormState {
  name: string;
  type: string;
  location: string;
  date: string;
  endDate: string;
  capacity: string;
  category: string;
  description: string;
}

const EMPTY: FormState = {
  name: '', type: '', location: '', date: '', endDate: '', capacity: '', category: '', description: '',
};

type FieldKey = keyof FormState;
type Errors = Partial<Record<FieldKey | '_form', string>>;

// datetime-local (hora local, sin zona) → ISO UTC. null si está vacío o es inválido.
function toIso(value: string): string | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Traduce un issue de Zod a un mensaje corto en español (presentación; la
// LÓGICA de validación sigue centralizada en el schema del contrato).
function friendly(issue: ZodIssue): string {
  switch (issue.code) {
    case 'too_small':
      return issue.type === 'string' ? `Mínimo ${issue.minimum} caracteres` : `Mínimo ${issue.minimum}`;
    case 'too_big':
      return issue.type === 'string' ? `Máximo ${issue.maximum} caracteres` : `Máximo ${issue.maximum}`;
    case 'invalid_enum_value':
      return 'Seleccioná una opción válida';
    case 'invalid_string':
      return 'Formato inválido';
    case 'invalid_type':
      return 'Requerido';
    default:
      return issue.message; // custom (superRefine) ya viene en español
  }
}

function serverMessage(status: number, body: { error?: string } | null): string {
  switch (status) {
    case 401: return 'Tu sesión expiró. Iniciá sesión de nuevo.';
    case 403: return 'No tienes permisos para crear actividades.';
    case 400: return body?.error ?? 'Revisá los datos del formulario.';
    default: return 'No pudimos crear la actividad. Intentá de nuevo.';
  }
}

export interface NewActivityDrawerProps {
  open: boolean;
  onClose: () => void;
  // Se llama tras un 201: el contenedor cierra y ejecuta router.refresh().
  onCreated: () => void;
}

export function NewActivityDrawer({ open, onClose, onCreated }: NewActivityDrawerProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const noticeId = `${baseId}-notice`;
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const coverLabelId = `${baseId}-cover`;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [coverFile, setCoverFile] = useState<File | null>(null);
  // Flujo: form → creating (POST create) → uploading (POST cover, si hay archivo)
  // → partial (creada pero falló la portada) / éxito. createdId se conserva para
  // reintentar SOLO el upload (nunca recrea la actividad).
  const [phase, setPhase] = useState<'form' | 'creating' | 'uploading' | 'partial'>('form');
  const createdIdRef = useRef<string | null>(null);
  const busy = phase === 'creating' || phase === 'uploading';

  const reset = () => {
    setForm(EMPTY);
    setErrors({});
    setCoverFile(null);
    setPhase('form');
    createdIdRef.current = null;
  };
  const success = () => {
    reset();
    onCreated();
  };

  // Cierre seguro: bloqueado mientras crea/sube. En 'partial' la actividad YA
  // existe → cerrar equivale a "finalizar sin portada" (cierra + refresca).
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const requestClose = useRef(() => {});
  requestClose.current = () => {
    if (busyRef.current) return;
    if (phaseRef.current === 'partial') { success(); return; }
    reset();
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Foco inicial al primer campo (no al panel) para arrancar a tipear.
    firstFieldRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const set = (key: FieldKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] || e._form ? { ...e, [key]: undefined, _form: undefined } : e));
  };

  // Construye el body del contrato + valida. Las conversiones que el schema no
  // puede hacer (datetime-local → ISO, capacity → number) se hacen acá con
  // guardas; el resto (longitudes, enum, endDate>=date, no-pasada) lo valida el
  // schema. Devuelve el body listo o los errores por campo.
  function validate(): { ok: true; body: unknown } | { ok: false; errors: Errors } {
    const fe: Errors = {};

    if (!form.type) fe.type = 'Seleccioná un tipo';

    let dateIso: string | undefined;
    if (!form.date) fe.date = 'Requerido';
    else {
      const iso = toIso(form.date);
      if (!iso) fe.date = 'Fecha inválida';
      else dateIso = iso;
    }

    let endIso: string | undefined;
    if (form.endDate) {
      const iso = toIso(form.endDate);
      if (!iso) fe.endDate = 'Fecha inválida';
      else endIso = iso;
    }

    let capNum: number | undefined;
    if (form.capacity.trim() === '') fe.capacity = 'Requerido';
    else {
      const n = Number(form.capacity);
      if (!Number.isInteger(n)) fe.capacity = 'Número entero';
      else capNum = n;
    }

    const candidate: Record<string, unknown> = {
      name: form.name.trim(),
      type: form.type,
      location: form.location.trim(),
      ...(dateIso ? { date: dateIso } : {}),
      ...(endIso ? { endDate: endIso } : {}),
      ...(capNum !== undefined ? { capacity: capNum } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(form.category.trim() ? { category: form.category.trim() } : {}),
    };

    const parsed = ActivityCreateRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const k = issue.path[0];
        if (typeof k === 'string' && !fe[k as FieldKey]) fe[k as FieldKey] = friendly(issue);
      }
    }

    if (Object.keys(fe).length > 0) return { ok: false, errors: fe };
    return { ok: true, body: parsed.success ? parsed.data : candidate };
  }

  // Sube la portada por su id. NO recrea la actividad. Devuelve ok/falló.
  async function uploadCover(id: string, f: File): Promise<boolean> {
    try {
      const fd = new FormData();
      fd.append('file', f, f.name); // sin setear content-type: el navegador pone el boundary
      const r = await fetch(`/app/actividades/api/${id}/cover`, { method: 'POST', body: fd });
      return r.ok;
    } catch {
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return; // no duplicar
    setErrors({});
    const v = validate();
    if (!v.ok) { setErrors(v.errors); return; }

    // Fase 1: crear actividad.
    setPhase('creating');
    let res: Response;
    try {
      res = await fetch('/app/actividades/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(v.body),
      });
    } catch {
      setPhase('form');
      setErrors({ _form: 'No pudimos crear la actividad. Revisá tu conexión e intentá de nuevo.' });
      return;
    }

    if (res.status !== 201) {
      setPhase('form');
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
      return;
    }

    // 201: actividad creada. Guardar id. Si hay portada → fase 2 (upload).
    let id: string | null = null;
    try { id = ((await res.json()) as { activity?: { id?: string } }).activity?.id ?? null; } catch { /* */ }
    createdIdRef.current = id;

    if (coverFile && id) {
      setPhase('uploading');
      const ok = await uploadCover(id, coverFile);
      if (ok) success(); else setPhase('partial'); // éxito parcial
    } else {
      success();
    }
  }

  // Reintenta SOLO el upload de la portada (la actividad ya existe).
  async function retryCover() {
    const id = createdIdRef.current;
    if (busy || !id || !coverFile) return;
    setPhase('uploading');
    const ok = await uploadCover(id, coverFile);
    if (ok) success(); else setPhase('partial');
  }

  const inputCls = (hasErr: boolean) =>
    cn(
      'mt-1 min-h-11 w-full rounded-lg border bg-surface px-3 py-2.5 text-[14px] text-ink',
      focusRing,
      hasErr ? 'border-danger-fg' : 'border-line',
    );
  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';
  const errId = (k: FieldKey) => `${baseId}-${k}-err`;
  const FieldError = ({ k }: { k: FieldKey }) =>
    errors[k] ? <span id={errId(k)} className="mt-1 block text-xs text-danger-fg">{errors[k]}</span> : null;

  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={() => requestClose.current()}
        className="absolute inset-0 bg-ink/40 motion-safe:transition-opacity"
      />
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t border-line bg-surface shadow-xl',
          'md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-full md:max-w-lg md:rounded-none md:border-l md:border-t-0',
          'flex flex-col',
        )}
      >
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
            {phase === 'partial' ? (
              <div role="alert" className="rounded-lg border border-primary-container bg-accent-soft px-3 py-2.5 text-[13px] text-on-primary-container">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" /> La actividad fue creada
                </span>
                , pero no pudimos subir la portada. Reintentá o finalizá sin portada.
              </div>
            ) : errors._form ? (
              <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">
                {errors._form}
              </p>
            ) : null}

            <fieldset disabled={busy || phase === 'partial'} className="m-0 min-w-0 space-y-4 border-0 p-0">
            <label className="block">
              <span className={labelCls}>Nombre</span>
              <input
                ref={firstFieldRef}
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? errId('name') : undefined}
                className={inputCls(!!errors.name)}
                placeholder="Ej: Concierto de apertura"
              />
              <FieldError k="name" />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelCls}>Tipo</span>
                <select
                  value={form.type}
                  onChange={(e) => set('type', e.target.value)}
                  aria-invalid={!!errors.type}
                  aria-describedby={errors.type ? errId('type') : undefined}
                  className={inputCls(!!errors.type)}
                >
                  <option value="" disabled>Seleccioná…</option>
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <FieldError k="type" />
              </label>

              <label className="block">
                <span className={labelCls}>Capacidad</span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  step={1}
                  value={form.capacity}
                  onChange={(e) => set('capacity', e.target.value)}
                  aria-invalid={!!errors.capacity}
                  aria-describedby={errors.capacity ? errId('capacity') : undefined}
                  className={cn(inputCls(!!errors.capacity), 'tabular-nums')}
                  placeholder="Ej: 120"
                />
                <FieldError k="capacity" />
              </label>
            </div>

            <label className="block">
              <span className={labelCls}>Lugar</span>
              <input
                type="text"
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
                aria-invalid={!!errors.location}
                aria-describedby={errors.location ? errId('location') : undefined}
                className={inputCls(!!errors.location)}
                placeholder="Ej: Sala principal"
              />
              <FieldError k="location" />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelCls}>Fecha y hora</span>
                <input
                  type="datetime-local"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  aria-invalid={!!errors.date}
                  aria-describedby={errors.date ? errId('date') : undefined}
                  className={inputCls(!!errors.date)}
                />
                <FieldError k="date" />
              </label>

              <label className="block">
                <span className={labelCls}>Cierre <span className="normal-case text-faint">(opcional)</span></span>
                <input
                  type="datetime-local"
                  value={form.endDate}
                  onChange={(e) => set('endDate', e.target.value)}
                  aria-invalid={!!errors.endDate}
                  aria-describedby={errors.endDate ? errId('endDate') : undefined}
                  className={inputCls(!!errors.endDate)}
                />
                <FieldError k="endDate" />
              </label>
            </div>

            <label className="block">
              <span className={labelCls}>Categoría <span className="normal-case text-faint">(opcional)</span></span>
              <input
                type="text"
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                aria-invalid={!!errors.category}
                aria-describedby={errors.category ? errId('category') : undefined}
                className={inputCls(!!errors.category)}
                placeholder="Ej: Ciclo de cine dominicano"
              />
              <FieldError k="category" />
            </label>

            <label className="block">
              <span className={labelCls}>Descripción <span className="normal-case text-faint">(opcional)</span></span>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={3}
                aria-invalid={!!errors.description}
                aria-describedby={errors.description ? errId('description') : undefined}
                className={cn(
                  'mt-1 min-h-[88px] w-full rounded-lg border bg-surface px-3 py-2.5 text-[14px] text-ink',
                  focusRing,
                  errors.description ? 'border-danger-fg' : 'border-line',
                )}
                placeholder="Detalles visibles para el equipo."
              />
              <FieldError k="description" />
            </label>
            </fieldset>

            <CoverDropzone file={coverFile} onSelect={setCoverFile} disabled={busy} labelId={coverLabelId} />
          </div>

          <footer className="border-t border-line px-5 py-4">
            {phase === 'partial' ? (
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={success}>Finalizar sin portada</Button>
                <Button type="button" onClick={retryCover}>Reintentar portada</Button>
              </div>
            ) : (
              <>
                <p id={noticeId} className="mb-3 text-[12px] text-faint">
                  Al crear, la actividad se <strong className="font-semibold text-muted">publica de inmediato</strong> como activa.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => requestClose.current()} disabled={busy}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={busy} aria-describedby={noticeId}>
                    {busy ? (
                      <>
                        <Loader2 size={16} strokeWidth={2.25} aria-hidden="true" className="animate-spin" />
                        {phase === 'creating' ? ' Creando actividad…' : ' Subiendo portada…'}
                      </>
                    ) : (
                      'Crear actividad'
                    )}
                  </Button>
                </div>
              </>
            )}
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
