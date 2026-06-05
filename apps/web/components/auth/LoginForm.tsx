'use client';

// components/auth/LoginForm.tsx · formulario de login del admin v2.
// POST same-origin a /api/auth/login (proxy → api-v2). En 200 navega a `next`
// (navegación completa → la nueva cookie viaja). En error muestra UN mensaje
// genérico: NO distingue email inexistente de password incorrecta (anti
// enumeración). 429 → mensaje de demasiados intentos. No guarda ni loguea PII.

import { useState, type FormEvent } from 'react';
import { LogIn, Loader2 } from 'lucide-react';
import { cn, focusRing } from '../ui/cn';

export interface LoginFormProps {
  next: string; // ya saneado server-side (ruta relativa bajo /app)
}

const GENERIC_ERROR = 'Credenciales inválidas. Revisá tu correo y contraseña.';
const RATE_ERROR = 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.';
const NET_ERROR = 'No pudimos conectar. Intentá de nuevo en un momento.';

export function LoginForm({ next }: LoginFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      email: String(data.get('email') ?? '').trim(),
      password: String(data.get('password') ?? ''),
      rememberMe: data.get('rememberMe') === 'on',
    };
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        // Navegación completa para que la cookie recién seteada llegue al gate.
        window.location.assign(next);
        return;
      }
      setError(res.status === 429 ? RATE_ERROR : GENERIC_ERROR);
    } catch {
      setError(NET_ERROR);
    } finally {
      setLoading(false);
    }
  }

  const inputCls = cn(
    'mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink',
    focusRing,
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-[#e0b4b4] bg-[#fdf3f3] px-3.5 py-2.5 text-[13px] font-medium text-[#9b1c1c]"
        >
          {error}
        </p>
      ) : null}

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
          Correo
        </span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          inputMode="email"
          placeholder="tu@correo.com"
          className={inputCls}
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
          Contraseña
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className={inputCls}
        />
      </label>

      <label className="flex items-center gap-2.5 text-[13px] text-muted">
        <input name="rememberMe" type="checkbox" className="h-4 w-4 rounded border-line accent-[color:var(--color-brand,#c44400)]" />
        Mantener la sesión iniciada
      </label>

      <button
        type="submit"
        disabled={loading}
        className={cn(
          'mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-strong px-4 text-[15px] font-semibold text-white shadow-sm transition hover:brightness-95 active:brightness-90 disabled:opacity-70',
          focusRing,
        )}
      >
        {loading ? (
          <Loader2 size={18} strokeWidth={2.25} aria-hidden="true" className="animate-spin" />
        ) : (
          <LogIn size={18} strokeWidth={2.25} aria-hidden="true" />
        )}
        {loading ? 'Ingresando…' : 'Ingresar'}
      </button>
    </form>
  );
}
