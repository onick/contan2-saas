'use client';

// components/usuarios/NewUserButton.tsx · alta de visitante desde el padrón (S1).
// Botón "Nuevo usuario" → drawer con el form (nombre/apellido/email/teléfono).
// POST al BFF (/app/usuarios/api → api-v2 POST /users): el código se genera
// server-side con el algoritmo v1 (continuidad de credenciales) y, si hay email,
// se envía la credencial (resultado honesto). Éxito → toast con el código real +
// router.refresh() (la lista server-side se recarga). Conserva datos ante error.

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { X, Loader2, UserPlus, CheckCircle2 } from 'lucide-react';
import { createUser } from '../../lib/api/profile-client';
import { IconButton, Button, cn, focusRing } from '../ui';

interface Form { firstName: string; lastName: string; email: string; phone: string }
const EMPTY: Form = { firstName: '', lastName: '', email: '', phone: '' };

const CRED_MSG: Record<string, string> = {
  sent: 'Credencial enviada a su email.',
  'dry-run': 'Credencial pendiente de envío (modo prueba).',
  skipped: 'Sin email: podés enviarle la credencial luego desde su perfil.',
  error: 'No se pudo enviar la credencial; reintentá desde su perfil.',
};

export function NewUserButton() {
  const router = useRouter();
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const firstRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ code: string; credential: string } | null>(null);

  const busyRef = useRef(busy); busyRef.current = busy;
  const requestClose = useRef(() => {});
  requestClose.current = () => { if (!busyRef.current) { setOpen(false); setForm(EMPTY); setError(null); setDone(null); } };

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

  const set = (k: keyof Form, v: string) => { setForm((f) => ({ ...f, [k]: v })); setError(null); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (form.firstName.trim().length < 1 || form.lastName.trim().length < 1) { setError('Nombre y apellido son obligatorios.'); return; }
    setBusy(true);
    const r = await createUser({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
    });
    setBusy(false);
    if (r.ok) {
      setDone({ code: r.data.user.code, credential: r.data.credential });
      setForm(EMPTY);
      router.refresh(); // la lista server-side recoge el alta
    } else {
      setError(r.error); // conserva los datos
    }
  }

  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';
  const inputCls = 'mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink';

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus size={18} strokeWidth={2} aria-hidden="true" /> Nuevo usuario
      </Button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
              <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => requestClose.current()} className="absolute inset-0 bg-ink/40" />
              <div className={cn('absolute inset-x-0 bottom-0 max-h-[92dvh] md:max-h-none rounded-t-2xl border-t border-line bg-surface shadow-xl', 'md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0', 'flex flex-col')}>
                <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    <p className={labelCls}>Padrón de visitantes</p>
                    <h2 id={titleId} className="mt-1 text-lg font-bold leading-tight tracking-tight text-ink">Nuevo usuario</h2>
                  </div>
                  <IconButton label="Cerrar" variant="outline" size="sm" onClick={() => requestClose.current()} disabled={busy}><X size={18} strokeWidth={2} aria-hidden="true" /></IconButton>
                </header>

                {done ? (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
                      <p className="flex items-center gap-2 text-[15px] font-semibold text-success-fg">
                        <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" /> Visitante creado
                      </p>
                      <p className="text-sm text-muted">
                        Su código es <span className="font-mono font-bold tabular-nums text-ink">{done.code}</span> — mismo formato que las credenciales ya emitidas; su QR funciona en el scanner desde ahora.
                      </p>
                      <p className="text-[13px] text-muted">{CRED_MSG[done.credential] ?? ''}</p>
                    </div>
                    <footer className="border-t border-line px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => { setDone(null); firstRef.current?.focus(); }}>Crear otro</Button>
                        <Button type="button" onClick={() => requestClose.current()}>Listo</Button>
                      </div>
                    </footer>
                  </div>
                ) : (
                  <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                      {error ? <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{error}</p> : null}
                      <fieldset disabled={busy} className="m-0 min-w-0 space-y-4 border-0 p-0">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <label className="block"><span className={labelCls}>Nombre</span><input ref={firstRef} type="text" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className={cn(inputCls, focusRing)} /></label>
                          <label className="block"><span className={labelCls}>Apellido</span><input type="text" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className={cn(inputCls, focusRing)} /></label>
                        </div>
                        <label className="block"><span className={labelCls}>Email <span className="normal-case text-faint">(opcional · recibe su credencial QR)</span></span><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={cn(inputCls, focusRing)} /></label>
                        <label className="block"><span className={labelCls}>Teléfono <span className="normal-case text-faint">(opcional)</span></span><input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={cn(inputCls, focusRing)} /></label>
                      </fieldset>
                    </div>
                    <footer className="border-t border-line px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => requestClose.current()} disabled={busy}>Cancelar</Button>
                        <Button type="submit" disabled={busy}>{busy ? <><Loader2 size={16} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Creando…</> : 'Crear visitante'}</Button>
                      </div>
                    </footer>
                  </form>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
