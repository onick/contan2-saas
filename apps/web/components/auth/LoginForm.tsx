'use client';

// components/auth/LoginForm.tsx · formulario de login del admin v2.
// POST same-origin a /api/auth/login (proxy → api-v2). En 200 navega a `next`
// (navegación completa → la nueva cookie viaja). En error muestra UN mensaje
// genérico: NO distingue email inexistente de password incorrecta (anti
// enumeración). 429 → mensaje de demasiados intentos. No guarda ni loguea PII.
//
// Rediseño visual (pill inputs + botón redondeado) SIN tocar la lógica: mismo
// onSubmit, mismos estados de carga/anti-doble-submit, mismos mensajes.

import { useState, type FormEvent } from 'react';
import { LogIn, Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { cn, focusRing } from '../ui/cn';

export interface LoginFormProps {
  next: string; // ya saneado server-side (ruta relativa bajo /app)
  // Pre-llenado desde el login email-first del marketing (?email=).
  defaultEmail?: string;
}

const GENERIC_ERROR = 'Credenciales inválidas. Revisá tu correo y contraseña.';
const RATE_ERROR = 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.';
const NET_ERROR = 'No pudimos conectar. Intentá de nuevo en un momento.';

export function LoginForm({ next, defaultEmail }: LoginFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false); // ojito: ver/ocultar contraseña

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

  // Input pill: ícono discreto a la izquierda, alto ~48px, label arriba.
  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';
  const iconCls = 'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint';
  const inputCls = cn(
    'h-12 w-full rounded-full border border-line bg-surface pl-11 pr-4 text-[15px] text-ink',
    'placeholder:text-faint',
    focusRing,
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[#e0b4b4] bg-[#fdf3f3] px-3.5 py-2.5 text-[13px] font-medium text-[#9b1c1c]"
        >
          {error}
        </p>
      ) : null}

      <label className="block">
        <span className={labelCls}>Correo</span>
        <div className="relative mt-1.5">
          <Mail size={18} strokeWidth={1.75} aria-hidden="true" className={iconCls} />
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus={!defaultEmail}
            defaultValue={defaultEmail}
            inputMode="email"
            placeholder="tu@correo.com"
            className={inputCls}
          />
        </div>
      </label>

      <label className="block">
        <span className={labelCls}>Contraseña</span>
        <div className="relative mt-1.5">
          <Lock size={18} strokeWidth={1.75} aria-hidden="true" className={iconCls} />
          <input
            name="password"
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className={cn('h-12 w-full rounded-full border border-line bg-surface pl-11 pr-12 text-[15px] text-ink', 'placeholder:text-faint', focusRing)}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={showPw}
            className={cn('absolute right-3 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full text-faint hover:text-ink hover:bg-surface-container', focusRing)}
          >
            {showPw ? <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </div>
      </label>

      <label className="flex items-center gap-2.5 text-[13px] text-muted">
        <input
          name="rememberMe"
          type="checkbox"
          className="h-4 w-4 rounded border-line accent-[color:var(--color-brand,#c44400)]"
        />
        Mantener la sesión iniciada
      </label>

      <button
        type="submit"
        disabled={loading}
        className={cn(
          'mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#e99838] px-4 text-[15px] font-semibold text-[#211c18] shadow-sm',
          'transition hover:brightness-95 active:translate-y-px active:brightness-90',
          'disabled:pointer-events-none disabled:opacity-70',
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
      <p className="text-center text-[13px]">
        <a href="/recuperar" className="rounded font-medium text-muted hover:text-ink">¿Olvidaste tu contraseña?</a>
      </p>
    </form>
  );
}
