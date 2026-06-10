'use client';

// components/usuarios/UserProfileDrawer.tsx · perfil READ-ONLY del visitante en un
// drawer accesible (UI-2a). Reutiliza useDrawerLifecycle (cierre animado, Escape,
// scroll-lock, foco). Al abrir, carga en paralelo detalle + historial (1ª página) +
// afinidad, cada sección con estado honesto (loading/error/empty). Copiar código con
// feedback accesible. SIN acciones de escritura (editar/reenviar/archivar) en UI-2a.

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, CalendarDays, MapPin, Tag, Users, Mail, Phone, FileText, Loader2, Sparkles, Pencil, Send, Archive, ArchiveRestore, Printer } from 'lucide-react';
import type { UserListItem, UserActivityHistoryItem, UserAffinityResponse, AffinityBucket, AdminUserUpdateRequest, AdminCredentialResendResponse } from '@contan2/contracts';
import { getUserDetail, getUserActivities, getUserAffinity, updateUser, resendCredential, archiveUser, reactivateUser } from '../../lib/api/profile-client';
import { initials, avatarFor } from './UsersTable';
import { Button, IconButton, Chip, cn, focusRing, useDrawerLifecycle, type ChipTone } from '../ui';

type Async<T> = { phase: 'loading' } | { phase: 'error'; error: string } | { phase: 'ready'; data: T };
const HISTORY_PAGE = 10;

const ABS = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('es', { hour: 'numeric', minute: '2-digit' });
// "9 jun 2026 · 4:12 p. m." (paridad v1: fecha + hora exacta del evento).
const fmtDateTime = (iso: string): string => { const d = new Date(iso); return `${ABS.format(d)} · ${TIME.format(d)}`; };
function relAgo(iso: string | null): string {
  if (!iso) return 'Nunca';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  const w = Math.floor(days / 7);
  if (w < 5) return w === 1 ? 'hace 1 semana' : `hace ${w} semanas`;
  const m = Math.floor(days / 30);
  return m === 1 ? 'hace 1 mes' : `hace ${m} meses`;
}
const STATUS: Record<'active' | 'dormant', { label: string; tone: ChipTone }> = {
  active: { label: 'Activo', tone: 'success' },
  dormant: { label: 'Dormido', tone: 'neutral' },
};
function credentialChip(u: UserListItem): { label: string; tone: ChipTone } {
  if (u.credentialSentAt) return { label: 'Credencial enviada', tone: 'success' };
  if (u.email) return { label: 'Credencial pendiente', tone: 'warning' };
  return { label: 'Sin email', tone: 'neutral' };
}
function maskEmail(e: string): string { const at = e.indexOf('@'); return at <= 0 ? '***' : `${e.slice(0, 1)}***@${e.slice(at + 1)}`; }
// Tono honesto del resultado de reenvío (NUNCA "enviado" verde en dry-run).
const RESEND_TONE: Record<AdminCredentialResendResponse['result'], string> = {
  sent: 'bg-success-bg text-success-fg',
  'dry-run': 'bg-surface-container text-muted',
  replayed: 'bg-surface-container text-muted',
  skipped: 'bg-accent-soft text-[#b35400]',
  error: 'bg-danger-bg text-danger-fg',
};

export interface UserProfileDrawerProps {
  code: string | null;
  onClose: () => void;
  canEdit?: boolean; // owner/admin → habilita editar (el API igual arbitra el rol)
  initialEdit?: boolean; // abrir directo en modo edición (acción "Editar" de la fila)
}

export function UserProfileDrawer({ code, onClose, canEdit = false, initialEdit = false }: UserProfileDrawerProps) {
  const titleId = useId();
  const open = code !== null;
  const { mounted, closing, panelRef } = useDrawerLifecycle({ open, onEscape: onClose });
  const containerRef = useRef<HTMLDivElement>(null);
  const editIntentConsumed = useRef(false);
  // Snapshot del último code no-nulo: retiene el contenido durante la animación de cierre.
  const shownRef = useRef(code);
  if (code) shownRef.current = code;
  const shown = shownRef.current;

  const [detail, setDetail] = useState<Async<UserListItem>>({ phase: 'loading' });
  const [affinity, setAffinity] = useState<Async<UserAffinityResponse>>({ phase: 'loading' });
  const [history, setHistory] = useState<Async<UserActivityHistoryItem[]>>({ phase: 'loading' });
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [copied, setCopied] = useState(false);
  // Edición (F2B)
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Reenvío de credencial (F2C)
  const [resendOpen, setResendOpen] = useState(false);
  const [resendKey, setResendKey] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  const [resendResult, setResendResult] = useState<AdminCredentialResendResponse | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  // Archivar/reactivar (F2D)
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Carga al abrir / cambiar de visitante. AbortController descarta respuestas obsoletas.
  useEffect(() => {
    if (!code) return;
    const ac = new AbortController();
    setDetail({ phase: 'loading' }); setAffinity({ phase: 'loading' });
    setHistory({ phase: 'loading' }); setHistoryTotal(0); setCopied(false);
    setEditing(false); setSaveError(null); editIntentConsumed.current = false;
    setResendOpen(false); setResendResult(null); setResendError(null);
    setArchiveConfirm(false); setArchiveError(null);
    void getUserDetail(code, ac.signal).then((r) => { if (!ac.signal.aborted) setDetail(r.ok ? { phase: 'ready', data: r.data.user } : { phase: 'error', error: r.error }); }).catch(() => {});
    void getUserAffinity(code, ac.signal).then((r) => { if (!ac.signal.aborted) setAffinity(r.ok ? { phase: 'ready', data: r.data } : { phase: 'error', error: r.error }); }).catch(() => {});
    void getUserActivities(code, HISTORY_PAGE, 0, ac.signal).then((r) => {
      if (ac.signal.aborted) return;
      if (r.ok) { setHistory({ phase: 'ready', data: r.data.items }); setHistoryTotal(r.data.total); }
      else setHistory({ phase: 'error', error: r.error });
    }).catch(() => {});
    return () => ac.abort();
  }, [code]);

  // Foco inicial al contenedor al abrir.
  useEffect(() => { if (mounted) containerRef.current?.focus(); }, [mounted]);

  // Acción "Editar" de la fila: entra directo en modo edición cuando el detalle
  // queda listo (una sola vez por apertura, y sólo con permiso).
  useEffect(() => {
    if (canEdit && initialEdit && detail.phase === 'ready' && !editIntentConsumed.current && !editing) {
      editIntentConsumed.current = true;
      startEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEdit, detail.phase, canEdit]);

  async function loadMore() {
    if (!shown || history.phase !== 'ready' || loadingMore) return;
    setLoadingMore(true);
    const r = await getUserActivities(shown, HISTORY_PAGE, history.data.length);
    setLoadingMore(false);
    if (r.ok) { setHistory({ phase: 'ready', data: [...history.data, ...r.data.items] }); setHistoryTotal(r.data.total); }
  }

  async function copyCode() {
    if (!shown) return;
    try { await navigator.clipboard.writeText(shown); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sin clipboard */ }
  }

  function startEdit() {
    if (detail.phase !== 'ready') return;
    const d = detail.data;
    setForm({ firstName: d.firstName, lastName: d.lastName, email: d.email ?? '', phone: d.phone ?? '' });
    setSaveError(null); setEditing(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!shown || detail.phase !== 'ready' || saving) return;
    const d = detail.data;
    // PATCH PARCIAL: sólo los campos modificados.
    const patch: AdminUserUpdateRequest = {};
    if (form.firstName.trim() !== d.firstName) patch.firstName = form.firstName.trim();
    if (form.lastName.trim() !== d.lastName) patch.lastName = form.lastName.trim();
    const email = form.email.trim();
    if (email !== (d.email ?? '')) patch.email = email === '' ? null : email;
    const phone = form.phone.trim();
    if (phone !== (d.phone ?? '')) patch.phone = phone === '' ? null : phone;
    if (Object.keys(patch).length === 0) { setEditing(false); return; }
    setSaving(true); setSaveError(null);
    const r = await updateUser(shown, patch);
    setSaving(false);
    if (r.ok) { setDetail({ phase: 'ready', data: r.data.user }); setEditing(false); }
    else setSaveError(r.error);
  }

  // Reenviar credencial: genera la Idempotency-Key al ABRIR el confirm; se REUSA en
  // reintentos/doble-click; una acción nueva genera otra key.
  function openResend() {
    setResendKey(crypto.randomUUID()); setResendResult(null); setResendError(null); setResendOpen(true);
  }
  async function confirmResend() {
    if (!shown || resendBusy) return;
    setResendBusy(true); setResendError(null);
    const r = await resendCredential(shown, resendKey); // MISMA key en reintentos
    setResendBusy(false);
    if (r.ok) {
      setResendResult(r.data); setResendOpen(false);
      if (detail.phase === 'ready') setDetail({ phase: 'ready', data: { ...detail.data, credentialSentAt: r.data.credentialSentAt } });
    } else setResendError(r.error); // mantiene el confirm; reintento reusa la key
  }

  async function doArchive() {
    if (!shown || archiveBusy) return;
    setArchiveBusy(true); setArchiveError(null);
    const r = await archiveUser(shown);
    setArchiveBusy(false);
    if (r.ok) { setArchiveConfirm(false); if (detail.phase === 'ready') setDetail({ phase: 'ready', data: { ...detail.data, deletedAt: r.data.deletedAt } }); }
    else setArchiveError(r.error);
  }
  async function doReactivate() {
    if (!shown || archiveBusy) return;
    setArchiveBusy(true); setArchiveError(null);
    const r = await reactivateUser(shown);
    setArchiveBusy(false);
    if (r.ok) { if (detail.phase === 'ready') setDetail({ phase: 'ready', data: { ...detail.data, deletedAt: null } }); }
    else setArchiveError(r.error);
  }

  if (!mounted || !shown || typeof document === 'undefined') return null;

  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';

  return createPortal(
    <div ref={containerRef} tabIndex={-1} className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={onClose}
        className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')} />
      <div ref={panelRef} className={cn(
        'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] md:max-h-none rounded-t-2xl border-t border-line bg-surface shadow-xl',
        'md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0',
        'flex flex-col', closing && 'drawer-panel--closing')}>
        {/* aria-live para el feedback de copiar */}
        <div aria-live="polite" className="sr-only">{copied ? 'Código copiado al portapapeles' : ''}</div>

        {/* Header con avatar (mismo color-hash que la tabla) · paridad v1. La acción
            Editar vive en el footer fijo (siempre visible), no acá. */}
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn('grid h-12 w-12 flex-none place-items-center rounded-full text-[15px] font-bold', avatarFor(shown))}>
              {detail.phase === 'ready' ? initials(`${detail.data.firstName} ${detail.data.lastName}`) : '…'}
            </span>
            <div className="min-w-0">
              <p className={labelCls}>Perfil del visitante</p>
              <h2 id={titleId} className="mt-0.5 truncate text-lg font-bold leading-tight tracking-tight text-ink">
                {detail.phase === 'ready' ? `${detail.data.firstName} ${detail.data.lastName}`.trim() : '…'}
              </h2>
              <div className="mt-0.5 flex items-center gap-2">
                <code className="text-[13px] tabular-nums text-muted">{shown}</code>
                <button type="button" onClick={copyCode}
                  className={cn('inline-flex items-center gap-1 rounded px-1 text-[12px] font-semibold text-brand', focusRing)}>
                  {copied ? <><Check size={13} strokeWidth={2.5} aria-hidden="true" /> Copiado</> : <><Copy size={13} strokeWidth={2} aria-hidden="true" /> Copiar</>}
                </button>
              </div>
            </div>
          </div>
          <IconButton label="Cerrar perfil" variant="outline" size="sm" onClick={onClose}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {detail.phase === 'error' ? (
            <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{detail.error}</p>
          ) : null}

          {/* Chips de estado */}
          {detail.phase === 'ready' ? (
            <div className="flex flex-wrap gap-2">
              {detail.data.deletedAt ? <Chip tone="neutral" dot>Archivado</Chip> : null}
              {detail.data.status ? <Chip tone={STATUS[detail.data.status].tone} dot>{STATUS[detail.data.status].label}</Chip> : null}
            </div>
          ) : null}

          {/* Credencial · TARJETA de estado (paridad v1): icono + estado + fecha/hora
              exacta del envío + acción inline. El confirm (con email enmascarado e
              Idempotency-Key reusada en reintentos, F2C) se despliega dentro. */}
          {detail.phase === 'ready' && !editing ? (
            <div className="space-y-2">
              <p className={labelCls}>Credencial</p>
              <div className={cn('rounded-xl border p-3', detail.data.credentialSentAt ? 'border-success-fg/25 bg-success-bg/40' : detail.data.email ? 'border-line bg-accent-soft/50' : 'border-line bg-surface-container')}>
                <div className="flex items-center gap-3">
                  <span className={cn('grid h-9 w-9 flex-none place-items-center rounded-full', detail.data.credentialSentAt ? 'bg-success-fg text-white' : detail.data.email ? 'bg-[#b35400] text-white' : 'bg-surface text-faint')}>
                    {detail.data.credentialSentAt ? <Check size={16} strokeWidth={2.5} aria-hidden="true" /> : <Send size={14} strokeWidth={2} aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{credentialChip(detail.data).label}</p>
                    <p className="text-xs text-muted">
                      {detail.data.credentialSentAt
                        ? fmtDateTime(detail.data.credentialSentAt)
                        : detail.data.email
                          ? 'Aún no se envió a su email.'
                          : 'Agregá un email para enviarle su credencial QR.'}
                    </p>
                  </div>
                  {canEdit && detail.data.email && !resendOpen ? (
                    <Button type="button" variant="secondary" size="sm" className="flex-none" onClick={openResend}>
                      <Send size={13} strokeWidth={2} aria-hidden="true" /> {detail.data.credentialSentAt ? 'Reenviar' : 'Enviar'}
                    </Button>
                  ) : null}
                </div>
                {resendOpen ? (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="text-[13px] text-ink">¿{detail.data.credentialSentAt ? 'Reenviar' : 'Enviar'} la credencial a <strong className="font-semibold">{maskEmail(detail.data.email ?? '')}</strong>?</p>
                    {resendError ? <p role="alert" className="mt-2 text-[12px] text-danger-fg">{resendError}</p> : null}
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setResendOpen(false)} disabled={resendBusy}>Cancelar</Button>
                      <Button type="button" size="sm" onClick={confirmResend} disabled={resendBusy}>
                        {resendBusy ? <><Loader2 size={14} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Enviando…</> : 'Sí, enviar'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              {resendResult ? (
                <p role="status" aria-live="polite" className={cn('rounded-lg px-3 py-2 text-[12px]', RESEND_TONE[resendResult.result])}>
                  {resendResult.message}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Métricas · fila con divisores (paridad v1, más liviana que cajas) */}
          <dl className="grid grid-cols-3 divide-x divide-line rounded-xl border border-line">
            <Metric label="Visitas" value={detail.phase === 'ready' ? String(detail.data.visitCount) : '—'} />
            <Metric label="Última visita" value={detail.phase === 'ready' ? relAgo(detail.data.lastVisitAt) : '—'} />
            <Metric label="Registro" value={detail.phase === 'ready' ? relAgo(detail.data.createdAt) : '—'} />
          </dl>

          {/* Contacto · lectura o edición (F2B) */}
          {detail.phase === 'ready' && editing ? (
            <form onSubmit={save} className="space-y-3">
              <p className={labelCls}>Editar datos</p>
              {saveError ? <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{saveError}</p> : null}
              <fieldset disabled={saving} className="m-0 grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2">
                <Field label="Nombre" value={form.firstName} onChange={(v) => setForm((f) => ({ ...f, firstName: v }))} />
                <Field label="Apellido" value={form.lastName} onChange={(v) => setForm((f) => ({ ...f, lastName: v }))} />
                <Field label="Email" type="email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} className="sm:col-span-2" />
                <Field label="Teléfono" type="tel" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} className="sm:col-span-2" />
              </fieldset>
              {/* Separador + aire: el focus ring del último input no debe tocar los
                  botones (mismo lenguaje que los footers de los drawers). */}
              <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
                <Button type="submit" size="sm" disabled={saving}>{saving ? <><Loader2 size={15} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Guardando…</> : 'Guardar cambios'}</Button>
              </div>
            </form>
          ) : detail.phase === 'ready' ? (
            <div className="space-y-2">
              <p className={labelCls}>Contacto</p>
              <CopyRow icon={Mail} value={detail.data.email} empty="Sin email" />
              <CopyRow icon={Phone} value={detail.data.phone} empty="Sin teléfono" />
            </div>
          ) : null}

          {/* Afinidad / intereses */}
          <div className="space-y-2">
            <p className={cn(labelCls, 'flex items-center gap-1.5')}><Sparkles size={13} strokeWidth={1.75} aria-hidden="true" /> Intereses y ubicaciones</p>
            {affinity.phase === 'loading' ? <SkeletonLine /> :
             affinity.phase === 'error' ? <p className="text-[13px] text-faint">{affinity.error}</p> :
             affinity.data.totalAttended === 0 ? <p className="text-[13px] text-faint">Aún sin asistencias registradas.</p> : (
              <div className="space-y-3">
                <Bars title="Tipos de actividad" buckets={affinity.data.byType} icon={Tag} />
                {affinity.data.byCategory.length ? <Bars title="Categorías" buckets={affinity.data.byCategory} icon={Tag} /> : null}
                {affinity.data.byLocation.length ? (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-muted"><MapPin size={12} strokeWidth={2} aria-hidden="true" /> Ubicaciones frecuentes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {affinity.data.byLocation.map((b) => <Chip key={b.key} tone="neutral">{b.key} · {b.count}</Chip>)}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Historial */}
          <div className="space-y-2">
            <p className={cn(labelCls, 'flex items-center gap-1.5')}><FileText size={13} strokeWidth={1.75} aria-hidden="true" /> Historial de actividades{historyTotal ? ` (${historyTotal})` : ''}</p>
            {history.phase === 'loading' ? <SkeletonLine /> :
             history.phase === 'error' ? <p className="text-[13px] text-faint">{history.error}</p> :
             history.data.length === 0 ? <p className="text-[13px] text-faint">Todavía no participó en actividades.</p> : (
              <>
                <ul className="space-y-2">
                  {history.data.map((h, i) => (
                    <li key={`${h.activityId}-${i}`} className="rounded-lg border border-line bg-surface px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{h.name}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
                            <span className="inline-flex items-center gap-1"><CalendarDays size={11} strokeWidth={2} aria-hidden="true" /> {fmtDateTime(h.checkedInAt ?? h.registeredAt)}</span>
                            <span className="inline-flex items-center gap-1"><MapPin size={11} strokeWidth={2} aria-hidden="true" /> {h.location}</span>
                            {h.companionsChildren > 0 ? <span className="inline-flex items-center gap-1"><Users size={11} strokeWidth={2} aria-hidden="true" /> +{h.companionsChildren}</span> : null}
                          </p>
                        </div>
                        <Chip tone={h.attended ? 'success' : 'neutral'}>{h.attended ? 'Asistió' : 'Registrado'}</Chip>
                      </div>
                    </li>
                  ))}
                </ul>
                {history.data.length < historyTotal ? (
                  <Button type="button" variant="secondary" className="w-full" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? <><Loader2 size={15} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Cargando…</> : `Cargar más (${historyTotal - history.data.length})`}
                  </Button>
                ) : null}
              </>
            )}
          </div>

          {/* Archivar/reactivar (F2D) · acción separada al final, confirmación explícita. */}
          {detail.phase === 'ready' && canEdit ? (
            <div className="space-y-2 border-t border-line pt-4">
              <p className={labelCls}>Estado del visitante</p>
              {archiveError ? <p role="alert" className="text-[12px] text-danger-fg">{archiveError}</p> : null}
              {detail.data.deletedAt ? (
                <Button type="button" variant="secondary" size="sm" onClick={doReactivate} disabled={archiveBusy}>
                  {archiveBusy ? <><Loader2 size={14} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Reactivando…</> : <><ArchiveRestore size={14} strokeWidth={2} aria-hidden="true" /> Reactivar visitante</>}
                </Button>
              ) : !archiveConfirm ? (
                <Button type="button" variant="secondary" size="sm" className="text-danger-fg" onClick={() => { setArchiveError(null); setArchiveConfirm(true); }}>
                  <Archive size={14} strokeWidth={2} aria-hidden="true" /> Archivar visitante
                </Button>
              ) : (
                <div className="rounded-lg border border-line bg-surface-container p-3">
                  <p className="text-[13px] text-ink">¿Archivar a este visitante? Se ocultará del listado; su historial y asistencias se preservan. Podés reactivarlo luego.</p>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setArchiveConfirm(false)} disabled={archiveBusy}>Cancelar</Button>
                    <Button type="button" size="sm" className="text-danger-fg" onClick={doArchive} disabled={archiveBusy}>
                      {archiveBusy ? <><Loader2 size={14} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Archivando…</> : 'Sí, archivar'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer FIJO (paridad v1): acciones principales siempre visibles.
            Imprimir abre el PNG REAL de la credencial (mismo que el email) listo
            para imprimir. En edición se oculta (mandan Cancelar/Guardar del form). */}
        {!editing ? (
          <footer className="flex flex-none items-center gap-2 border-t border-line px-5 py-4">
            <a href={`/api/credentials/${encodeURIComponent(shown)}.png`} target="_blank" rel="noopener noreferrer"
              className={cn('inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-muted transition-colors hover:bg-page hover:text-ink', focusRing)}>
              <Printer size={16} strokeWidth={2} aria-hidden="true" /> Imprimir credencial
            </a>
            {canEdit && detail.phase === 'ready' && !detail.data.deletedAt ? (
              <Button type="button" className="flex-1" onClick={startEdit}>
                <Pencil size={15} strokeWidth={2} aria-hidden="true" /> Editar
              </Button>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
function Field({ label, value, onChange, type = 'text', className }: { label: string; value: string; onChange: (v: string) => void; type?: string; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className={cn('mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink', focusRing)} />
    </label>
  );
}
// Fila de contacto con COPIAR (paridad v1): icono en caja + valor + botón copy
// con feedback accesible propio. Sin valor → texto tenue, sin botón.
function CopyRow({ icon: Icon, value, empty }: { icon: typeof Mail; value: string | null; empty: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* sin clipboard */ }
  }
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-surface-container text-faint">
        <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className={cn('min-w-0 flex-1 truncate text-sm', value ? 'text-ink' : 'text-faint')}>{value ?? empty}</span>
      {value ? (
        <button type="button" onClick={copy} aria-label={done ? 'Copiado' : `Copiar ${empty.replace('Sin ', '')}`}
          className={cn('grid h-8 w-8 flex-none place-items-center rounded-lg text-faint hover:bg-surface-container hover:text-muted', focusRing)}>
          {done ? <Check size={14} strokeWidth={2.5} aria-hidden="true" className="text-success-fg" /> : <Copy size={14} strokeWidth={1.75} aria-hidden="true" />}
        </button>
      ) : null}
      <span aria-live="polite" className="sr-only">{done ? 'Copiado al portapapeles' : ''}</span>
    </div>
  );
}
function SkeletonLine() {
  return <div className="app-shimmer h-12 w-full rounded-lg" aria-busy="true" />;
}
function Bars({ title, buckets, icon: Icon }: { title: string; buckets: AffinityBucket[]; icon: typeof Tag }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-muted"><Icon size={12} strokeWidth={2} aria-hidden="true" /> {title}</p>
      <div className="space-y-1">
        {buckets.map((b) => (
          <div key={b.key} className="flex items-center gap-2">
            <span className="w-28 flex-none truncate text-[12px] text-ink">{b.key}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((b.count / max) * 100)}%` }} />
            </div>
            <span className="w-6 flex-none text-right text-[12px] tabular-nums text-faint">{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
