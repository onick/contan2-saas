'use client';

// apps/web/components/activities/ActivityForm.tsx · formulario COMPARTIDO de
// "Nueva actividad" (mode='create') y "Editar actividad" (mode='edit'), en página
// completa (antes eran dos drawers). Conserva TODA la lógica de los drawers:
//
//  · CREAR: PORTADA OBLIGATORIA, un solo POST multipart atómico a
//    /app/actividades/api/with-cover (nunca crea sin portada). Las imágenes grandes
//    se optimizan en el cliente (optimizeCover) antes de enviarse.
//  · EDITAR: PATCH PARCIAL (sólo los campos modificados, forma de contrato; nunca
//    organizationId/enrolledCount/imageUrl/status). La portada actual se muestra y
//    es opcional reemplazarla (1º sube la portada nueva, 2º PATCH); el encuadre
//    vertical viaja como imagePosY. Si la portada ya subió y el PATCH falla, un
//    reintento no la vuelve a subir.
//  · Anti-doble-submit (busy), object URLs liberados, errores del servidor en un
//    role="alert", errores inline con aria-invalid + aria-describedby.
//
// El botón primario usa aria-disabled (sigue enfocable): al pulsarlo con datos
// incompletos no envía; muestra los errores y lleva el foco al primer campo con
// error. La barra inferior (aria-live) dice qué falta.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Loader2, ImagePlus, RefreshCw, Sparkles, AlertTriangle, FileText, CalendarDays, MapPin,
  Globe, CircleCheck, Info, Plus, Upload, Trash2,
} from 'lucide-react';
import {
  ActivityCreateRequestSchema, ActivityUpdateRequestSchema, ACTIVITY_TYPES, type ActivityDetail,
} from '@contan2/contracts';
import type { ZodIssue } from 'zod';
import { TYPE_LABELS } from '../../lib/activities/typeLabels';
import { optimizeCover, OptimizeError, formatBytes, type OptimizeResult } from '../../lib/images/optimizeCover';
import { CoverReframe } from './CoverReframe';
import { ProgramPicker } from './ProgramPicker';
import { StatusBadge } from './StatusBadge';
import { Button, Card, DateTimeField, cn, focusRing } from '../ui';

const ACCEPT = 'image/jpeg,image/png,image/webp';

interface FormState {
  name: string; type: string; location: string; date: string;
  endDate: string; capacity: string; category: string; description: string; audience: string;
}
const EMPTY: FormState = { name: '', type: '', location: '', date: '', endDate: '', capacity: '', category: '', description: '', audience: 'adultos' };
type FieldKey = keyof FormState;
type Errors = Partial<Record<FieldKey | '_form', string>>;

// Orden visual de los campos: el foco va al primero con error.
const FOCUS_ORDER: FieldKey[] = ['name', 'type', 'capacity', 'description', 'location', 'date', 'endDate', 'category'];
const FIELD_LABEL: Record<string, string> = {
  name: 'nombre', type: 'tipo', capacity: 'capacidad', location: 'lugar', date: 'fecha y hora',
};

// ISO → "YYYY-MM-DDTHH:mm" en hora LOCAL (lo que espera datetime-local).
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
// datetime-local → ISO UTC. null si vacío/inválido.
export function toIso(value: string): string | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function formFromDetail(d: ActivityDetail): FormState {
  return {
    name: d.name, type: d.type, location: d.location,
    date: isoToLocalInput(d.date), endDate: isoToLocalInput(d.endDate),
    capacity: String(d.capacity), category: d.category ?? '',
    description: d.description ?? '', audience: d.audience,
  };
}

function friendly(issue: ZodIssue): string {
  switch (issue.code) {
    case 'too_small': return issue.type === 'string' ? `Mínimo ${issue.minimum} caracteres` : `Mínimo ${issue.minimum}`;
    case 'too_big': return issue.type === 'string' ? `Máximo ${issue.maximum} caracteres` : `Máximo ${issue.maximum}`;
    case 'invalid_enum_value': return 'Selecciona una opción válida';
    case 'invalid_string': return 'Formato inválido';
    case 'invalid_type': return 'Requerido';
    default: return issue.message;
  }
}

function serverMessage(mode: 'create' | 'edit', status: number, body: { error?: string } | null): string {
  const create = mode === 'create';
  switch (status) {
    case 401: return 'Tu sesión expiró. Inicia sesión de nuevo.';
    case 403: return create ? 'No tienes permiso para crear actividades.' : 'No tienes permiso para editar actividades.';
    case 404: return 'La actividad ya no existe o no pertenece a este centro.';
    case 409: return body?.error ?? 'La capacidad no puede ser menor que la cantidad de inscritos.';
    case 413: return body?.error ?? 'La imagen supera el máximo de 5 MB.';
    case 415: return body?.error ?? 'Formato de imagen no permitido.';
    case 400: return body?.error ?? 'Revisa los datos del formulario.';
    case 502: return body?.error ?? 'Problema de red. Reintenta.';
    default: return create ? 'No pudimos crear la actividad. Intenta de nuevo.' : 'No pudimos guardar los cambios. Intenta de nuevo.';
  }
}

// Portada: 'none' = sin portada nueva (crear: vacío; editar: se conserva la actual);
// 'optimizing' mientras se procesa; 'ready' = imagen nueva lista para subir.
type CoverState =
  | { phase: 'none' }
  | { phase: 'optimizing' }
  | { phase: 'ready'; result: OptimizeResult; previewUrl: string; filename: string };

const STATUS_BADGE = {
  activa: { status: 'live', label: 'Activa' },
  finalizada: { status: 'done', label: 'Finalizada' },
  cancelada: { status: 'draft', label: 'Cancelada' },
} as const;

export interface ActivityFormProps {
  mode: 'create' | 'edit';
  initial?: ActivityDetail;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

// Estilos de campo (mockup: etiqueta normal-case, campo de 44 px).
const FIELD_BASE = 'min-h-11 w-full rounded-field border bg-surface px-3 py-2.5 text-[14px] text-ink placeholder:text-faint';
const fieldCls = (hasErr: boolean, extra?: string) =>
  cn(FIELD_BASE, focusRing, hasErr ? 'border-danger-fg' : 'border-border-strong', extra);

export function ActivityForm({ mode, initial, onSaved, onCancel }: ActivityFormProps) {
  const isEdit = mode === 'edit';
  const baseId = useId();
  const id = (k: string) => `${baseId}-${k}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const coverBtnRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const initialForm = useMemo(() => (initial ? formFromDetail(initial) : EMPTY), [initial]);
  const initialPosY = initial?.imagePosY ?? 50;
  const existingCover = isEdit ? initial?.imageUrl ?? null : null;

  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Errors>({});
  const [cover, setCover] = useState<CoverState>({ phase: 'none' });
  const [coverErr, setCoverErr] = useState<string | null>(null);
  const [posY, setPosY] = useState(initialPosY); // 50 = centro (en crear no se envía)
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // previewUrl de la última portada YA subida (editar): un reintento tras fallo del
  // PATCH no re-sube el mismo archivo.
  const uploadedCoverRef = useRef<string | null>(null);

  // Revoca el object URL del preview al reemplazarlo o desmontar.
  const previewUrlRef = useRef<string | null>(null);
  const setPreview = (url: string | null) => {
    if (previewUrlRef.current && previewUrlRef.current !== url) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
  };
  useEffect(() => () => setPreview(null), []);

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
      setCover({ phase: 'none' }); // crear: vuelve al dropzone; editar: conserva la actual
      setCoverErr(e instanceof OptimizeError ? e.message : 'No pudimos procesar la imagen.');
    }
  }
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleCover(e.target.files?.[0] ?? null);
    if (fileRef.current) fileRef.current.value = ''; // permite re-elegir el mismo archivo
  };
  const removeCover = () => {
    setPreview(null);
    setCover({ phase: 'none' });
    setCoverErr(null);
    if (!isEdit) setPosY(50);
  };

  // ── Estado derivado ────────────────────────────────────────────────────────
  const dirty = useMemo(
    () => (Object.keys(EMPTY) as FieldKey[]).filter((k) => form[k] !== initialForm[k]),
    [form, initialForm],
  );
  const hasChanges = dirty.length > 0 || cover.phase === 'ready' || posY !== initialPosY;
  const hasCover = cover.phase === 'ready' || !!existingCover;

  // Campos obligatorios vacíos (en vivo) → mensaje de la barra y aria-disabled.
  const missingFields = (['name', 'type', 'capacity', 'location', 'date'] as const).filter((k) => form[k].trim() === '');
  const coverMissing = !isEdit && cover.phase !== 'ready';
  const missingLabels = [...missingFields.map((k) => FIELD_LABEL[k]), ...(coverMissing ? ['portada'] : [])];
  const incomplete = missingLabels.length > 0;
  const blocked = busy || incomplete || cover.phase === 'optimizing' || (isEdit && !hasChanges);

  // Mensaje vivo de la barra inferior.
  let bar: { tone: 'warn' | 'ok'; title: string; hint: string };
  if (busy) bar = { tone: 'ok', title: isEdit ? 'Guardando cambios…' : 'Creando actividad…', hint: 'No cierres esta página.' };
  else if (cover.phase === 'optimizing') bar = { tone: 'warn', title: 'Optimizando imagen…', hint: 'Un momento, preparando la portada.' };
  else if (!isEdit && missingFields.length === 0 && coverMissing) bar = { tone: 'warn', title: 'Solo falta la portada', hint: 'Añade una imagen para habilitar la creación.' };
  else if (incomplete) {
    const n = missingLabels.length;
    const shown = missingLabels.slice(0, 3).join(', ') + (n > 3 ? '…' : '');
    bar = { tone: 'warn', title: `${n === 1 ? 'Falta 1 campo' : `Faltan ${n} campos`}: ${shown}`, hint: 'Complétalos para continuar.' };
  } else if (isEdit && !hasChanges) bar = { tone: 'ok', title: 'Sin cambios por guardar', hint: 'Modifica algún dato para habilitar el guardado.' };
  else bar = { tone: 'ok', title: isEdit ? 'Todo listo para guardar' : 'Todo listo para crear', hint: 'Revisa los datos y confirma.' };

  // ── Validación ─────────────────────────────────────────────────────────────
  // Obligatorios vacíos (mensajes cortos, sin pasar por el contrato).
  function requiredErrors(): Errors {
    const fe: Errors = {};
    if (!form.name.trim()) fe.name = 'Requerido';
    if (!form.type) fe.type = 'Selecciona un tipo';
    if (form.capacity.trim() === '') fe.capacity = 'Requerido';
    if (!form.location.trim()) fe.location = 'Requerido';
    if (!form.date) fe.date = 'Requerido';
    return fe;
  }

  // CREAR · valida contra ActivityCreateRequestSchema y arma los campos del multipart.
  function validateCreate(): { ok: true; fields: Record<string, string> } | { ok: false; errors: Errors } {
    const fe: Errors = requiredErrors();
    let dateIso: string | undefined;
    if (form.date) { const iso = toIso(form.date); if (!iso) fe.date = 'Fecha inválida'; else dateIso = iso; }
    let endIso: string | undefined;
    if (form.endDate) { const iso = toIso(form.endDate); if (!iso) fe.endDate = 'Fecha inválida'; else endIso = iso; }
    let capNum: number | undefined;
    if (form.capacity.trim() !== '') { const n = Number(form.capacity); if (!Number.isInteger(n)) fe.capacity = 'Número entero'; else capNum = n; }

    const candidate: Record<string, unknown> = {
      name: form.name.trim(), type: form.type, location: form.location.trim(),
      ...(dateIso ? { date: dateIso } : {}),
      ...(endIso ? { endDate: endIso } : {}),
      ...(capNum !== undefined ? { capacity: capNum } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(form.category.trim() ? { category: form.category.trim() } : {}),
      audience: form.audience,
    };
    const parsed = ActivityCreateRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const k = issue.path[0];
        if (typeof k === 'string' && !fe[k as FieldKey]) fe[k as FieldKey] = friendly(issue);
      }
    }
    if (Object.keys(fe).length > 0) return { ok: false, errors: fe };

    const fields: Record<string, string> = {
      name: form.name.trim(), type: form.type, location: form.location.trim(),
      date: dateIso!, capacity: String(capNum),
    };
    if (endIso) fields.endDate = endIso;
    if (form.description.trim()) fields.description = form.description.trim();
    if (form.category.trim()) fields.category = form.category.trim();
    fields.audience = form.audience;
    return { ok: true, fields };
  }

  // EDITAR · body PARCIAL (sólo dirty) + cross-checks de cliente (paridad api-v2):
  // endDate >= date y fecha no pasada si la actividad está activa.
  function buildPatch(): { ok: true; body: Record<string, unknown> } | { ok: false; errors: Errors } {
    const fe: Errors = requiredErrors();
    const body: Record<string, unknown> = {};

    if (dirty.includes('name')) body.name = form.name.trim();
    if (dirty.includes('type') && form.type) body.type = form.type;
    if (dirty.includes('location')) body.location = form.location.trim();
    if (dirty.includes('date') && form.date) {
      const iso = toIso(form.date); if (!iso) fe.date = 'Fecha inválida'; else body.date = iso;
    }
    if (dirty.includes('endDate')) {
      if (!form.endDate) body.endDate = null;
      else { const iso = toIso(form.endDate); if (!iso) fe.endDate = 'Fecha inválida'; else body.endDate = iso; }
    }
    if (dirty.includes('capacity') && form.capacity.trim() !== '') {
      const n = Number(form.capacity);
      if (!Number.isInteger(n)) fe.capacity = 'Número entero'; else body.capacity = n;
    }
    if (dirty.includes('description')) body.description = form.description.trim();
    if (dirty.includes('category')) { const c = form.category.trim(); body.category = c === '' ? null : c; }
    if (dirty.includes('audience')) body.audience = form.audience;
    if (posY !== initialPosY) body.imagePosY = posY;

    const effDate = (body.date as string | undefined) ?? initial?.date ?? undefined;
    const effEnd = (body.endDate as string | null | undefined) ?? (dirty.includes('endDate') ? undefined : initial?.endDate);
    if (effEnd && effDate && new Date(effEnd).getTime() < new Date(effDate).getTime()) {
      fe.endDate = 'Debe ser igual o posterior a la fecha de inicio.';
    }
    if (body.date && initial?.status === 'activa' && new Date(body.date as string).getTime() < Date.now() - 60_000) {
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

  // Muestra errores y lleva el foco al primer campo con error (o a la portada).
  function surface(fe: Errors, coverError: boolean) {
    setErrors(fe);
    if (coverError) setCoverErr('La portada es obligatoria.');
    const first = FOCUS_ORDER.find((k) => fe[k]);
    if (first) {
      document.getElementById(id(first))?.focus();
    } else if (coverError) {
      coverBtnRef.current?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErrors({}); setCoverErr(null);

    // aria-disabled: no envía; enseña qué falta y enfoca el primer campo con error.
    if (incomplete || cover.phase === 'optimizing') {
      if (cover.phase === 'optimizing') return;
      surface(requiredErrors(), coverMissing);
      return;
    }
    if (isEdit && !hasChanges) return;

    if (isEdit) await submitEdit(); else await submitCreate();
  }

  async function submitCreate() {
    if (cover.phase !== 'ready') { surface({}, true); return; }
    const v = validateCreate();
    if (!v.ok) { surface(v.errors, false); return; }

    const fd = new FormData();
    for (const [k, val] of Object.entries(v.fields)) fd.append(k, val);
    if (posY !== 50) fd.append('imagePosY', String(posY)); // 50 = centro = default
    fd.append('cover', cover.result.blob, cover.filename);

    setBusy(true);
    let res: Response;
    try {
      res = await fetch('/app/actividades/api/with-cover', { method: 'POST', body: fd });
    } catch {
      setBusy(false);
      setErrors({ _form: 'No pudimos crear la actividad. Revisa tu conexión e intenta de nuevo.' });
      return;
    }
    if (res.status === 201) {
      let newId = '';
      try { newId = ((await res.json()) as { activity?: { id?: string } }).activity?.id ?? ''; } catch { /* sin JSON */ }
      onSaved(newId);
      return; // busy queda activo: la página navega
    }
    await failure(res);
  }

  async function submitEdit() {
    if (!initial) return;
    const v = buildPatch();
    if (!v.ok) { surface(v.errors, false); return; }

    setBusy(true);
    // 1º · portada nueva (si hay): mismo pipeline que el alta (multipart → cover).
    if (cover.phase === 'ready' && uploadedCoverRef.current !== cover.previewUrl) {
      let up: Response;
      try {
        const fd = new FormData();
        fd.append('cover', cover.result.blob, cover.filename);
        up = await fetch(`/app/actividades/api/${encodeURIComponent(initial.id)}/cover`, { method: 'POST', body: fd });
      } catch {
        setBusy(false);
        setCoverErr('Problema de red al subir la portada. Reintenta.');
        return;
      }
      if (!up.ok) {
        setBusy(false);
        let body: { error?: string } | null = null;
        try { body = (await up.json()) as { error?: string }; } catch { /* sin JSON */ }
        setCoverErr(body?.error ?? 'No pudimos subir la portada. Intenta de nuevo.');
        return;
      }
      uploadedCoverRef.current = cover.previewUrl; // no re-subir si el PATCH falla
    }

    // 2º · PATCH parcial (si quedó algo que mandar). Si sólo cambió la portada, listo.
    if (Object.keys(v.body).length === 0) { onSaved(initial.id); return; }

    let res: Response;
    try {
      res = await fetch(`/app/actividades/api/${encodeURIComponent(initial.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(v.body),
      });
    } catch {
      setBusy(false);
      setErrors({ _form: 'Problema de red. Revisa tu conexión e intenta de nuevo.' });
      return;
    }
    if (res.status === 200) { onSaved(initial.id); return; }
    await failure(res);
  }

  // Error de servidor: conserva los datos, libera el formulario.
  async function failure(res: Response) {
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
      setErrors(Object.keys(fe).length ? fe : { _form: serverMessage(mode, 400, body) });
    } else if (!isEdit && (res.status === 413 || res.status === 415)) {
      setCoverErr(serverMessage(mode, res.status, body));
    } else {
      setErrors({ _form: serverMessage(mode, res.status, body) });
    }
  }

  // ── Piezas de UI ───────────────────────────────────────────────────────────
  const describedBy = (k: FieldKey, extra?: string) =>
    [errors[k] ? `${id(k)}-err` : null, extra].filter(Boolean).join(' ') || undefined;
  const FieldError = ({ k }: { k: FieldKey }) =>
    errors[k] ? <span id={`${id(k)}-err`} className="mt-1 block text-xs text-danger-fg">{errors[k]}</span> : null;
  const Helper = ({ k, children }: { k: string; children: ReactNode }) =>
    <span id={`${id(k)}-help`} className="mt-1 block text-xs text-faint">{children}</span>;
  // El asterisco vive FUERA del <label> (no entra en el nombre accesible).
  const Label = ({ htmlFor, children, required, optional }: { htmlFor: string; children: ReactNode; required?: boolean; optional?: boolean }) => (
    <div className="mb-1.5 flex items-baseline gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">{children}</label>
      {required ? <span aria-hidden="true" className="text-[13px] font-semibold text-danger-fg">*</span> : null}
      {optional ? <span className="text-xs text-faint">Opcional</span> : null}
    </div>
  );
  const SectionHead = ({ icon: Icon, title, desc }: { icon: typeof FileText; title: string; desc: string }) => (
    <div className="mb-5 flex items-start gap-3">
      <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-primary-container text-on-primary-container">
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{desc}</p>
      </div>
    </div>
  );

  const year = (() => { const y = new Date(form.date).getFullYear(); return Number.isFinite(y) ? y : undefined; })();
  const coverReady = hasCover;
  const previewSrc = cover.phase === 'ready' ? cover.previewUrl : existingCover;

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate aria-label={isEdit ? 'Editar actividad' : 'Nueva actividad'}>
      {errors._form ? (
        <p role="alert" className="mb-4 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{errors._form}</p>
      ) : null}

      <input ref={fileRef} id={id('file')} type="file" accept={ACCEPT} className="sr-only" aria-hidden="true" tabIndex={-1} onChange={onFileChange} disabled={busy} />

      <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ── Columna izquierda ─────────────────────────────────────────── */}
          <div className="contents lg:flex lg:flex-col lg:gap-6">
            {/* 1 · Información general */}
            <Card padding="lg" className="order-1 lg:order-none">
              <SectionHead icon={FileText} title="Información general" desc="Define cómo se identificará la actividad." />
              <div className="space-y-5">
                <div>
                  <Label htmlFor={id('name')} required>Nombre</Label>
                  <input id={id('name')} type="text" required aria-required="true" value={form.name} onChange={(e) => set('name', e.target.value)}
                    aria-invalid={!!errors.name} aria-describedby={describedBy('name')} className={fieldCls(!!errors.name)} placeholder="Ej: Concierto de apertura" />
                  <FieldError k="name" />
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={id('type')} required>Tipo</Label>
                    <select id={id('type')} required aria-required="true" value={form.type} onChange={(e) => set('type', e.target.value)}
                      aria-invalid={!!errors.type} aria-describedby={describedBy('type')} className={fieldCls(!!errors.type)}>
                      <option value="" disabled>Selecciona…</option>
                      {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}
                    </select>
                    <FieldError k="type" />
                  </div>
                  <div>
                    <Label htmlFor={id('capacity')} required>Capacidad</Label>
                    <div className="relative">
                      <input id={id('capacity')} type="number" inputMode="numeric" required aria-required="true" min={1} max={10000} step={1} value={form.capacity}
                        onChange={(e) => set('capacity', e.target.value)} aria-invalid={!!errors.capacity} aria-describedby={describedBy('capacity')}
                        className={fieldCls(!!errors.capacity, 'pr-24 tabular-nums')} placeholder="Ej: 120" />
                      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-faint">personas</span>
                    </div>
                    <FieldError k="capacity" />
                  </div>
                </div>

                <div>
                  <div role="radiogroup" aria-labelledby={id('audience-label')} aria-describedby={id('audience-help')}>
                    <div className="mb-1.5 flex items-baseline gap-1.5">
                      <span id={id('audience-label')} className="text-[13px] font-semibold text-ink">Público</span>
                      <span aria-hidden="true" className="text-[13px] font-semibold text-danger-fg">*</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {([['adultos', 'Adultos'], ['infantil', 'Infantil']] as const).map(([val, lbl]) => (
                        <label key={val} className={cn(
                          'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-pill border px-5 text-sm font-semibold transition-colors',
                          'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-surface',
                          form.audience === val ? 'border-ink bg-ink text-white' : 'border-border-strong bg-surface text-ink hover:bg-subtle',
                        )}>
                          <input type="radio" name={id('audience')} value={val} checked={form.audience === val} onChange={() => set('audience', val)} className="sr-only" />
                          {lbl}
                        </label>
                      ))}
                    </div>
                  </div>
                  <Helper k="audience">Define cómo el kiosko pregunta por acompañantes.</Helper>
                </div>

                <div>
                  <Label htmlFor={id('description')} optional>Descripción</Label>
                  <textarea id={id('description')} rows={4} value={form.description} onChange={(e) => set('description', e.target.value)}
                    aria-invalid={!!errors.description} aria-describedby={describedBy('description', id('description-help'))}
                    className={cn(fieldCls(!!errors.description), 'min-h-[104px] resize-y')} placeholder="Cuenta de qué trata la actividad." />
                  <Helper k="description">Se muestra en la pantalla pública.</Helper>
                  <FieldError k="description" />
                </div>
              </div>
            </Card>

            {/* 2 · Lugar y horario */}
            <Card padding="lg" className="order-3 lg:order-none">
              <SectionHead icon={CalendarDays} title="Lugar y horario" desc="Indica dónde y cuándo se realizará." />
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={id('location')} required>Lugar</Label>
                    <div className="relative">
                      <input id={id('location')} type="text" required aria-required="true" value={form.location} onChange={(e) => set('location', e.target.value)}
                        aria-invalid={!!errors.location} aria-describedby={describedBy('location')} className={fieldCls(!!errors.location, 'pr-10')} placeholder="Ej: Sala principal" />
                      <MapPin size={17} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                    </div>
                    <FieldError k="location" />
                  </div>
                  <div>
                    <Label htmlFor={id('date')} required>Fecha y hora</Label>
                    <DateTimeField id={id('date')} value={form.date} onChange={(v) => set('date', v)} invalid={!!errors.date}
                      aria-invalid={!!errors.date} aria-describedby={describedBy('date')} required minuteStep={5} />
                    <FieldError k="date" />
                  </div>
                </div>
                <div>
                  <Label htmlFor={id('endDate')} optional>Cierre</Label>
                  <DateTimeField id={id('endDate')} value={form.endDate} onChange={(v) => set('endDate', v)} invalid={!!errors.endDate}
                    aria-invalid={!!errors.endDate} aria-describedby={describedBy('endDate', id('endDate-help'))}
                    min={form.date || undefined} minuteStep={5} />
                  <Helper k="endDate">Puedes dejarlo vacío si aún no tienes una fecha y hora de cierre.</Helper>
                  <FieldError k="endDate" />
                </div>
              </div>
            </Card>

            {/* 3 · Programa / ciclo */}
            <Card padding="lg" className="order-4 lg:order-none">
              <div className="mb-1.5 flex items-baseline gap-1.5">
                <label htmlFor={id('category')} className="text-[15px] font-semibold text-ink">Programa / ciclo</label>
                <span className="text-xs text-faint">Opcional</span>
              </div>
              <ProgramPicker value={form.category} onChange={(v) => set('category', v)} year={year}
                selectClassName={fieldCls(!!errors.category)} selectId={id('category')} />
              <Helper k="category">Asocia la actividad a un programa o ciclo, si corresponde.</Helper>
              <FieldError k="category" />
            </Card>
          </div>

          {/* ── Columna derecha ───────────────────────────────────────────── */}
          <div className="contents lg:flex lg:flex-col lg:gap-6">
            {/* Portada */}
            <div className="order-2 lg:order-none">
              <Card padding="lg">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 id={id('cover-title')} className="text-[17px] font-semibold tracking-tight text-ink">
                    Portada{!isEdit ? <> <span aria-hidden="true" className="text-danger-fg">*</span><span className="sr-only"> (requerida)</span></> : null}
                  </h2>
                  <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                    coverReady ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>
                    {coverReady ? 'Lista' : 'Pendiente'}
                  </span>
                </div>

                {cover.phase === 'optimizing' ? (
                  <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface-container text-muted" aria-busy="true">
                    <Loader2 size={20} strokeWidth={2.25} aria-hidden="true" className="animate-spin" />
                    <span className="text-[13px]">Optimizando imagen…</span>
                  </div>
                ) : previewSrc ? (
                  <div>
                    <CoverReframe src={previewSrc} posY={posY} onChange={setPosY} disabled={busy} />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button ref={coverBtnRef} type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                        className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-line bg-surface px-4 text-[13px] font-semibold text-ink hover:bg-subtle disabled:opacity-50', focusRing)}>
                        <RefreshCw size={14} strokeWidth={2} aria-hidden="true" /> Cambiar imagen
                      </button>
                      {cover.phase === 'ready' ? (
                        <button type="button" disabled={busy} onClick={removeCover}
                          className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-pill px-3 text-[13px] font-semibold text-muted hover:bg-surface-container hover:text-ink disabled:opacity-50', focusRing)}>
                          <Trash2 size={14} strokeWidth={2} aria-hidden="true" /> Quitar
                        </button>
                      ) : null}
                    </div>
                    {cover.phase === 'ready' ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs tabular-nums text-success-fg">
                        <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
                        {cover.result.optimized
                          ? `Optimizada · original ${formatBytes(cover.result.originalSize)} → ${formatBytes(cover.result.finalSize)}`
                          : `Imagen lista · ${formatBytes(cover.result.finalSize)}`}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!busy) void handleCover(e.dataTransfer.files?.[0] ?? null); }}
                    className={cn('flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 text-center transition-colors',
                      dragOver ? 'border-brand bg-brand-soft' : 'border-border-strong bg-surface')}
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface-container text-muted">
                      <ImagePlus size={22} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <p className="mt-1 text-[15px] font-semibold text-ink">Arrastra tu imagen aquí</p>
                    <p className="text-[13px] text-muted">o selecciónala desde tu equipo</p>
                    <button ref={coverBtnRef} type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                      className={cn('mt-2 inline-flex min-h-11 items-center gap-2 rounded-pill bg-brand-soft px-5 text-sm font-semibold text-brand-text hover:brightness-95 disabled:opacity-50', focusRing)}>
                      <Upload size={16} strokeWidth={2} aria-hidden="true" /> Seleccionar imagen
                    </button>
                    {isEdit ? <p className="mt-1 text-xs text-faint">Esta actividad no tiene portada.</p> : null}
                  </div>
                )}

                {coverErr ? (
                  <span role="alert" className="mt-3 flex items-center gap-1.5 text-xs text-danger-fg">
                    <AlertTriangle size={13} strokeWidth={2} aria-hidden="true" /> {coverErr}
                  </span>
                ) : null}

                <p className="mt-4 text-xs font-medium text-ink">JPEG, PNG o WebP · las imágenes grandes se optimizan automáticamente</p>
                <p className="mt-1 text-[13px] text-muted">
                  {isEdit ? 'Reemplazar la portada es opcional.' : 'La portada es obligatoria y acompañará la publicación de tu actividad.'}
                </p>
              </Card>
            </div>

            {/* Publicación (tono neutro) */}
            <Card padding="lg" className="order-5 lg:order-none">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-primary-container text-on-primary-container">
                  <Globe size={20} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <h2 className="text-[17px] font-semibold tracking-tight text-ink">{isEdit ? 'Publicación' : 'Publicación inmediata'}</h2>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                {isEdit
                  ? 'Los cambios se publican al guardar. El estado se gestiona desde el menú de la actividad.'
                  : 'Al crear, la actividad se publica de inmediato como activa, con su portada.'}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
                <span className="text-[13px] text-muted">{isEdit ? 'Estado actual' : 'Estado al crear'}</span>
                {isEdit && initial ? (
                  <StatusBadge status={STATUS_BADGE[initial.status].status} label={STATUS_BADGE[initial.status].label} />
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success-fg">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success-fg" /> Activa
                  </span>
                )}
              </div>
            </Card>

            <p className="order-6 flex items-start gap-2 px-1 text-[13px] text-muted lg:order-none">
              <CircleCheck size={17} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 flex-none" />
              {isEdit
                ? 'Antes de guardar, revisa el nombre, la capacidad y el horario de la actividad.'
                : 'Antes de crear, revisa el nombre, la capacidad y el horario de la actividad.'}
            </p>
          </div>
        </div>
      </fieldset>

      {/* ── Barra inferior pegada ──────────────────────────────────────────── */}
      {/* En móvil se apoya sobre la barra de navegación inferior (MobileNav, ~4rem). */}
      <div className={cn(
        'sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 mt-6 md:bottom-0',
        'rounded-card border border-line bg-surface/95 px-4 py-3 shadow-md backdrop-blur md:px-5 md:py-4',
        'flex flex-wrap items-center justify-between gap-3',
      )}>
        <div aria-live="polite" data-testid="form-status" className="flex min-w-0 items-start gap-3">
          {bar.tone === 'warn'
            ? <Info size={20} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 flex-none text-brand-text" />
            : <CircleCheck size={20} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 flex-none text-success-fg" />}
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink">{bar.title}</p>
            <p className="text-[13px] text-muted">{bar.hint}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button type="submit" aria-disabled={blocked || undefined}
            className={blocked && !busy ? 'cursor-not-allowed opacity-60' : undefined}>
            {busy ? (
              <><Loader2 size={16} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> {isEdit ? 'Guardando…' : 'Creando actividad…'}</>
            ) : isEdit ? 'Guardar cambios' : (<><Plus size={18} strokeWidth={2.25} aria-hidden="true" /> Crear actividad</>)}
          </Button>
        </div>
      </div>
    </form>
  );
}
