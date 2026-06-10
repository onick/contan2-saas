'use client';

// apps/web/components/checkin/NewVisitorDrawer.tsx · alta de visitante NUEVO + su
// check-in en UNA sola operación (POST /checkin con visitor.new + activityId). Drawer
// accesible (role=dialog, Escape, scroll-lock, foco inicial). Anti doble-submit;
// conserva los datos ante fallo (email existente 409, validación 400, red).

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import type { CheckinActivityItem } from '@contan2/contracts';
import { postCheckin } from '../../lib/api/checkin-client';
import { IconButton, Button, cn, focusRing } from '../ui';

interface Form { firstName: string; lastName: string; email: string; phone: string; activityId: string }
const EMPTY: Form = { firstName: '', lastName: '', email: '', phone: '', activityId: '' };

export interface NewVisitorDrawerProps {
  open: boolean;
  activities: CheckinActivityItem[];
  onClose: () => void;
  onDone: (msg: string) => void; // éxito → el contenedor cierra + refresca + toast
}

export function NewVisitorDrawer({ open, activities, onClose, onDone }: NewVisitorDrawerProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const firstRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectable = activities.filter((a) => !a.full);

  const busyRef = useRef(busy); busyRef.current = busy;
  const requestClose = useRef(() => {});
  requestClose.current = () => { if (!busyRef.current) { setForm(EMPTY); setError(null); onClose(); } };

  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; prevActive?.focus?.(); };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const set = (k: keyof Form, v: string) => { setForm((f) => ({ ...f, [k]: v })); setError(null); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (form.firstName.trim().length < 1 || form.lastName.trim().length < 1) { setError('Nombre y apellido son obligatorios.'); return; }
    if (!form.activityId) { setError('Elegí una actividad para el check-in.'); return; }
    setBusy(true);
    const r = await postCheckin({
      activityId: form.activityId,
      visitor: { new: { firstName: form.firstName.trim(), lastName: form.lastName.trim(), ...(form.email.trim() ? { email: form.email.trim() } : {}), ...(form.phone.trim() ? { phone: form.phone.trim() } : {}) } },
      companionsChildren: 0,
    });
    setBusy(false);
    if (r.ok) {
      const act = activities.find((a) => a.id === form.activityId);
      setForm(EMPTY);
      onDone(`${r.data.code} creado y registrado en "${act?.name ?? 'la actividad'}". Quedó auditado.`);
    } else {
      setError(r.error); // conserva los datos
    }
  }

  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';
  const inputCls = 'mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink';

  return createPortal(
    <div className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => requestClose.current()} className="drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity" />
      <div className={cn('drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] md:max-h-none rounded-t-2xl border-t border-line bg-surface shadow-xl', 'md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0', 'flex flex-col')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className={labelCls}>Nuevo visitante</p>
            <h2 id={titleId} className="mt-1 text-lg font-bold leading-tight tracking-tight text-ink">Crear y registrar</h2>
          </div>
          <IconButton label="Cerrar" variant="outline" size="sm" onClick={() => requestClose.current()} disabled={busy}><X size={18} strokeWidth={2} aria-hidden="true" /></IconButton>
        </header>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error ? <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{error}</p> : null}
            <fieldset disabled={busy} className="m-0 min-w-0 space-y-4 border-0 p-0">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block"><span className={labelCls}>Nombre</span><input ref={firstRef} type="text" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className={cn(inputCls, focusRing)} /></label>
                <label className="block"><span className={labelCls}>Apellido</span><input type="text" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className={cn(inputCls, focusRing)} /></label>
              </div>
              <label className="block"><span className={labelCls}>Email <span className="normal-case text-faint">(opcional)</span></span><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={cn(inputCls, focusRing)} /></label>
              <label className="block"><span className={labelCls}>Teléfono <span className="normal-case text-faint">(opcional)</span></span><input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={cn(inputCls, focusRing)} /></label>
              <label className="block">
                <span className={labelCls}>Actividad</span>
                <select value={form.activityId} onChange={(e) => set('activityId', e.target.value)} className={cn(inputCls, focusRing)}>
                  <option value="" disabled>Elegí una actividad…</option>
                  {selectable.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.enrolledCount}/{a.capacity})</option>)}
                </select>
              </label>
            </fieldset>
          </div>
          <footer className="border-t border-line px-5 py-4">
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => requestClose.current()} disabled={busy}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy ? <><Loader2 size={16} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Registrando…</> : 'Crear y registrar'}</Button>
            </div>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
