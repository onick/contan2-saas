'use client';

// components/platform/PlatformLoginForm.tsx · login del super-admin de
// plataforma. POST same-origin a /platform/api/login (→ api-v2, relaya la cookie
// contan2_admin_session). En 200 navega a /platform. Sin tenant.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';

export function PlatformLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'loading'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === 'loading') return;
    setPhase('loading'); setError(null);
    try {
      const res = await fetch('/platform/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe: remember }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase('idle');
        setError(data.error ?? 'No pudimos iniciar sesión.');
        return;
      }
      router.replace('/platform');
      router.refresh();
    } catch {
      setPhase('idle');
      setError('Problema de red. Reintentá.');
    }
  }

  const inputCls =
    'w-full rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none focus:border-white/40 focus:ring-2 focus:ring-white/10';

  return (
    <form onSubmit={onSubmit} className="w-full max-w-[380px]">
      <div className="mb-7 flex flex-col items-center text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-white/15">
          <ShieldCheck size={24} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-white">Centro de mando</h1>
        <p className="mt-1 text-[13.5px] text-white/45">Panel del operador de contan2</p>
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">
          {error}
        </p>
      ) : null}

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">Correo</span>
        <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
          className={`mt-1.5 ${inputCls}`} placeholder="tu@correo.com" />
      </label>

      <label className="mt-4 block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">Contraseña</span>
        <div className="relative mt-1.5">
          <input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-11`} placeholder="••••••••" />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar' : 'Mostrar'}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-white/40 hover:text-white/70">
            {show ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
          </button>
        </div>
      </label>

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-[13px] text-white/55">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
          className="h-4 w-4 rounded border-white/25 bg-transparent" />
        Mantener la sesión iniciada
      </label>

      <button type="submit" disabled={phase === 'loading'}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-[14px] font-semibold text-[#0e1116] transition hover:bg-white/90 disabled:opacity-60">
        {phase === 'loading' ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Entrando…</> : 'Ingresar'}
      </button>

      <p className="mt-6 text-center text-[11.5px] text-white/30">Acceso restringido al operador de la plataforma.</p>
    </form>
  );
}
