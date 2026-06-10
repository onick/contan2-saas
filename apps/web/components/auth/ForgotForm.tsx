'use client';

// Formulario "olvidé mi contraseña". POST same-origin a /recuperar/api → api-v2
// forgot-password (anti-enumeración: el éxito SIEMPRE muestra el mismo mensaje,
// exista o no la cuenta — la UI no puede saber más que eso, a propósito).

import { useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { Button, cn, focusRing } from '../ui';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/recuperar/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.status === 429) {
        setError('Demasiados intentos. Esperá unos minutos.');
      } else if (!res.ok) {
        setError('No pudimos procesar la solicitud. Intentá de nuevo.');
      } else {
        setDone(true);
      }
    } catch {
      setError('Problema de red. Revisá tu conexión.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center" role="status">
        <MailCheck size={28} strokeWidth={1.75} aria-hidden="true" className="text-success-fg" />
        <p className="text-sm font-semibold text-ink">Revisá tu correo</p>
        <p className="text-[13px] text-muted">Si la cuenta existe, vas a recibir un enlace para crear una contraseña nueva. Vence en 1 hora.</p>
        <a href="/login" className={cn('mt-2 rounded text-[13px] font-semibold text-brand hover:underline', focusRing)}>Volver a ingresar</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{error}</p> : null}
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Email</span>
        <input
          type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className={cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing)}
          placeholder="tu@correo.com"
        />
      </label>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? (<><Loader2 size={16} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Enviando…</>) : 'Enviarme el enlace'}
      </Button>
      <p className="text-center text-[13px]">
        <a href="/login" className={cn('rounded font-medium text-muted hover:text-ink', focusRing)}>Volver a ingresar</a>
      </p>
    </form>
  );
}
