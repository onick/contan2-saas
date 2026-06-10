'use client';

// Aceptación de invitación (/invite/[token]): nombre (precargado si vino en la
// invitación) + contraseña nueva → POST /invite/api. Éxito → CTA a /login.

import { useState } from 'react';
import { Loader2, PartyPopper } from 'lucide-react';
import { Button, cn, focusRing } from '../ui';

export function AcceptInviteForm({ token, initialName }: { token: string; initialName: string }) {
  const [fullName, setFullName] = useState(initialName);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pw !== pw2) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch('/invite/api', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password: pw, ...(fullName.trim() ? { fullName: fullName.trim() } : {}) }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 201) setDone(true);
      else setError(body?.error ?? 'No pudimos crear la cuenta. Pedí una invitación nueva.');
    } catch {
      setError('Problema de red. Revisá tu conexión.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center" role="status">
        <PartyPopper size={28} strokeWidth={1.75} aria-hidden="true" className="text-success-fg" />
        <p className="text-sm font-semibold text-ink">Cuenta creada</p>
        <p className="text-[13px] text-muted">Ya formás parte del equipo. Ingresá con tu correo y la contraseña que elegiste.</p>
        <a href="/login" className={cn('mt-2 rounded text-[13px] font-semibold text-brand hover:underline', focusRing)}>Ir a ingresar</a>
      </div>
    );
  }

  const inputCls = cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing);
  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{error}</p> : null}
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Tu nombre</span>
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Contraseña</span>
        <input type="password" required minLength={10} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
        <span className="mt-1 block text-[11px] text-faint">Mínimo 10 caracteres; no solo números ni contraseñas comunes.</span>
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Repetir contraseña</span>
        <input type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} />
      </label>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? (<><Loader2 size={16} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Creando cuenta…</>) : 'Crear mi cuenta'}
      </Button>
    </form>
  );
}
