'use client';

import { useState, useEffect, useId, type FormEvent, type ReactNode } from 'react';
import { X, UserPlus, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Status = 'idle' | 'submitting' | 'success' | 'error';

const INK = '#16181d';
const ACCENT = '#e65100';
const MUTED = '#6b7077';
const LINE = '#e6e3dd';

function LabeldField({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12.5px] font-semibold text-[#3d4148]">
        {label}
        {required ? <span aria-hidden="true" style={{ color: ACCENT }}> *</span> : null}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border bg-white px-3 py-2 text-[14px] text-[#16181d] outline-none transition-shadow placeholder:text-[#9ca3af] focus:border-[#16181d] focus:shadow-[0_0_0_3px_rgba(22,24,29,0.08)]';

export function SignupModal({ open, onClose }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fid = useId();
  const orgNameId = `${fid}-orgName`;
  const fullNameId = `${fid}-fullName`;
  const emailId = `${fid}-email`;
  const passwordId = `${fid}-password`;
  const confirmPasswordId = `${fid}-confirmPassword`;

  // Lock scroll + Escape mientras está abierto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Reset al cerrar.
  useEffect(() => {
    if (!open && status !== 'idle') {
      setStatus('idle');
      setErrorMsg(null);
    }
  }, [open, status]);

  if (!open) return null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg(null);
    const fd = new FormData(e.currentTarget);
    const orgVal = String(fd.get('organizationName') ?? '').trim();
    const fullVal = String(fd.get('fullName') ?? '').trim();
    const emailVal = String(fd.get('email') ?? '').trim();
    const passVal = String(fd.get('password') ?? '');
    const confVal = String(fd.get('confirmPassword') ?? '');

    if (!orgVal || !fullVal || !emailVal || !passVal || !confVal) {
      setErrorMsg('Todos los campos obligatorios deben ser completados.');
      setStatus('error');
      return;
    }

    if (passVal.length < 8) {
      setErrorMsg('La contraseña debe tener al menos 8 caracteres.');
      setStatus('error');
      return;
    }

    if (passVal !== confVal) {
      setErrorMsg('Las contraseñas no coinciden.');
      setStatus('error');
      return;
    }

    const payload = {
      organizationName: orgVal,
      fullName: fullVal,
      email: emailVal,
      password: passVal,
      confirmPassword: confVal,
    };

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: string };
      if (res.ok && data.redirectUrl) {
        setStatus('success');
        // Redirigir al callback de la organización
        window.location.href = data.redirectUrl;
        return;
      }
      setErrorMsg(data.error ?? 'Algo salió mal. Intentá de nuevo.');
      setStatus('error');
    } catch {
      setErrorMsg('No pudimos conectar con el servidor. Intentá de nuevo.');
      setStatus('error');
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
      {/* Backdrop: clic NO cierra (anti-pérdida de datos). */}
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fid}-title`}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_60px_-12px_rgba(22,24,29,0.4)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={`${fid}-title`} className="text-[18px] font-semibold" style={{ color: INK }}>
              Comenzar prueba gratuita
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
              Registra tu organización e ingresa al panel al instante.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 rounded-full p-1.5 transition-colors hover:bg-[#f3f1ed]"
            style={{ color: MUTED }}
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-3.5" noValidate>
          <LabeldField id={orgNameId} label="Nombre de la Organización" required>
            <input
              id={orgNameId}
              name="organizationName"
              type="text"
              required
              autoFocus
              placeholder="Centro Cultural de Arte..."
              maxLength={100}
              className={inputClass}
              style={{ borderColor: LINE }}
            />
          </LabeldField>

          <LabeldField id={fullNameId} label="Nombre Completo del Administrador" required>
            <input
              id={fullNameId}
              name="fullName"
              type="text"
              required
              placeholder="Carlos Gómez"
              maxLength={100}
              className={inputClass}
              style={{ borderColor: LINE }}
            />
          </LabeldField>

          <LabeldField id={emailId} label="Email del Administrador" required>
            <input
              id={emailId}
              name="email"
              type="email"
              required
              placeholder="carlos@mi-centro.org"
              maxLength={255}
              className={inputClass}
              style={{ borderColor: LINE }}
            />
          </LabeldField>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <LabeldField id={passwordId} label="Contraseña" required>
              <input
                id={passwordId}
                name="password"
                type="password"
                required
                placeholder="Mín. 8 caracteres"
                className={inputClass}
                style={{ borderColor: LINE }}
              />
            </LabeldField>
            <LabeldField id={confirmPasswordId} label="Confirmar Contraseña" required>
              <input
                id={confirmPasswordId}
                name="confirmPassword"
                type="password"
                required
                placeholder="Repetir contraseña"
                className={inputClass}
                style={{ borderColor: LINE }}
              />
            </LabeldField>
          </div>

          {errorMsg ? (
            <p role="alert" className="text-[13px] font-medium" style={{ color: '#b91c1c' }}>
              {errorMsg}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={status === 'submitting' || status === 'success'}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-[14.5px] font-semibold text-white transition-opacity disabled:opacity-70"
            style={{ background: ACCENT }}
          >
            {status === 'submitting' || status === 'success' ? (
              <>
                <Loader2 size={15} strokeWidth={2.25} className="animate-spin" aria-hidden="true" />
                Creando cuenta e ingresando…
              </>
            ) : (
              <>
                Comenzar prueba de 14 días
                <UserPlus size={15} strokeWidth={2.25} aria-hidden="true" />
              </>
            )}
          </button>

          <p className="text-center text-[12px] leading-relaxed" style={{ color: MUTED }}>
            Al registrarte aceptas las condiciones y políticas. <br />
            No se requiere tarjeta de crédito.
          </p>
        </form>
      </div>
    </div>
  );
}
