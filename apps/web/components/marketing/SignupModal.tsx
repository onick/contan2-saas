'use client';

// components/marketing/SignupModal.tsx · modal de registro en 2 pasos:
// Paso 1: formulario de datos → envía código de verificación al email.
// Paso 2: input de 6 dígitos → verifica y crea la cuenta.

import { useState, useEffect, useRef, useId, type FormEvent, type ReactNode, type KeyboardEvent as RKE } from 'react';
import { createPortal } from 'react-dom';
import { Fraunces } from 'next/font/google';
import { X, Loader2, Mail, RotateCcw, Eye, EyeOff, Check, ArrowRight } from 'lucide-react';

const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600'], style: ['normal', 'italic'] });

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = 'form' | 'verify';
type Status = 'idle' | 'submitting' | 'success' | 'error';

const INK = '#16181d';
const ACCENT = '#e65100';
const MUTED = '#6b7077';
const LINE = '#e6e3dd';

function LabeledField({
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
  const [step, setStep] = useState<Step>('form');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [rawEmail, setRawEmail] = useState('');
  const [formData, setFormData] = useState<Record<string, string> | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);
  const fid = useId();

  const eyeBtn = 'absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[#9ca3af] transition-colors hover:text-[#16181d]';

  // Lock scroll + Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
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

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep('form');
      setStatus('idle');
      setErrorMsg(null);
      setMaskedEmail('');
      setRawEmail('');
      setFormData(null);
      setDigits(['', '', '', '', '', '']);
      setResendCooldown(0);
      setShowPw(false);
      setShowConfirm(false);
    }
  }, [open]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  if (!open || typeof document === 'undefined') return null;

  // ── Step 1: Submit form ──
  async function onSubmitForm(e: FormEvent<HTMLFormElement>) {
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
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; email?: string; error?: string };
      if (res.ok && data.ok) {
        setMaskedEmail(data.email ?? emailVal);
        setRawEmail(emailVal);
        setFormData(payload);
        setStep('verify');
        setStatus('idle');
        setResendCooldown(60);
        setDigits(['', '', '', '', '', '']);
        // Focus first digit after render
        setTimeout(() => digitRefs.current[0]?.focus(), 100);
        return;
      }
      setErrorMsg(data.error ?? 'Algo salió mal. Intentá de nuevo.');
      setStatus('error');
    } catch {
      setErrorMsg('No pudimos conectar con el servidor. Intentá de nuevo.');
      setStatus('error');
    }
  }

  // ── Step 2: Verify code ──
  async function onVerify(codeStr?: string) {
    const code = codeStr ?? digits.join('');
    if (code.length !== 6) {
      setErrorMsg('Ingresá el código completo de 6 dígitos.');
      setStatus('error');
      return;
    }
    setStatus('submitting');
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/signup-verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: rawEmail, code }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: string };
      if (res.ok && data.redirectUrl) {
        setStatus('success');
        window.location.href = data.redirectUrl;
        return;
      }
      setErrorMsg(data.error ?? 'Código inválido. Intentá de nuevo.');
      setStatus('error');
    } catch {
      setErrorMsg('No pudimos conectar con el servidor. Intentá de nuevo.');
      setStatus('error');
    }
  }

  // ── Resend code ──
  async function onResend() {
    if (resendCooldown > 0 || !formData) return;
    setStatus('submitting');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setResendCooldown(60);
        setDigits(['', '', '', '', '', '']);
        setStatus('idle');
        setErrorMsg(null);
        setTimeout(() => digitRefs.current[0]?.focus(), 100);
        return;
      }
      setErrorMsg(data.error ?? 'No pudimos reenviar el código.');
      setStatus('error');
    } catch {
      setErrorMsg('No pudimos conectar con el servidor.');
      setStatus('error');
    }
  }

  // ── Digit input handlers ──
  function handleDigitChange(idx: number, val: string) {
    // Handle paste of full code
    if (val.length > 1) {
      const cleaned = val.replace(/\D/g, '').slice(0, 6);
      if (cleaned.length === 6) {
        const newDigits = cleaned.split('');
        setDigits(newDigits);
        digitRefs.current[5]?.focus();
        // Auto-submit on paste
        setTimeout(() => onVerify(cleaned), 50);
        return;
      }
    }

    const char = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[idx] = char;
    setDigits(newDigits);
    setErrorMsg(null);

    if (char && idx < 5) {
      digitRefs.current[idx + 1]?.focus();
    }

    // Auto-submit when all 6 digits are filled
    if (char && idx === 5) {
      const code = newDigits.join('');
      if (code.length === 6) {
        setTimeout(() => onVerify(code), 50);
      }
    }
  }

  function handleDigitKeyDown(idx: number, e: RKE<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      digitRefs.current[idx - 1]?.focus();
    }
  }

  const stepNum = step === 'form' ? 1 : 2;

  // Panel de marca (izquierda en desktop) — constante entre pasos, da contexto
  // y confianza. Editorial: Fraunces + tinta + naranja, como el landing.
  const brandPanel = (
    <aside
      className="relative hidden flex-col justify-between overflow-hidden bg-[#16181d] p-8 text-white md:flex"
      aria-hidden="true"
    >
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(230,81,0,0.30), transparent 70%)' }}
      />
      <div className="relative">
        <span className={fraunces.className} style={{ fontWeight: 600, fontSize: 24, letterSpacing: '-0.02em' }}>
          contan<b style={{ color: ACCENT, fontWeight: 600 }}>2</b>
        </span>
      </div>
      <div className="relative">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: '#f0a56b' }}>
          Prueba gratuita · 14 días
        </p>
        <h3 className={`${fraunces.className} mt-3 text-[25px] font-medium leading-[1.12] tracking-[-0.01em]`}>
          El sistema operativo de tu <em style={{ color: '#f0a56b' }}>centro cultural</em>.
        </h3>
      </div>
      <ul className="relative space-y-2.5">
        {['Sin tarjeta de crédito', 'Credencial QR permanente', 'Check-in y reportes con tu marca', 'Listo para usar hoy'].map((t) => (
          <li key={t} className="flex items-center gap-2.5 text-[13.5px] text-white/85">
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(230,81,0,0.92)' }}>
              <Check size={11} strokeWidth={3} aria-hidden="true" />
            </span>
            {t}
          </li>
        ))}
      </ul>
    </aside>
  );

  // ── Render (portal a document.body: así `fixed` se ancla al viewport y no a un
  // ancestro con transform/filter —p.ej. el header sticky con backdrop-blur—, que
  // era lo que dejaba el modal "metido" arriba y tapado por el navegador). ──
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto px-4 py-8 md:items-center">
      <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px]" aria-hidden="true" onClick={onClose} />
      <style>{`@keyframes signupModalIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}.signup-modal-card{animation:signupModalIn 260ms cubic-bezier(.22,1,.36,1)}@media (prefers-reduced-motion:reduce){.signup-modal-card{animation:none}}`}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fid}-title`}
        className="signup-modal-card relative my-auto grid w-full max-w-md grid-cols-1 overflow-hidden rounded-2xl bg-white shadow-[0_30px_70px_-15px_rgba(22,24,29,0.5)] md:max-w-[840px] md:grid-cols-[288px_1fr]"
      >
        {brandPanel}
        <div className="relative">
          {/* Barra de marca compacta (solo móvil) */}
          <div className="flex items-center justify-between bg-[#16181d] py-3 pl-6 pr-14 text-white md:hidden">
            <span className={fraunces.className} style={{ fontWeight: 600, fontSize: 19, letterSpacing: '-0.02em' }}>
              contan<b style={{ color: ACCENT, fontWeight: 600 }}>2</b>
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90">14 días · sin tarjeta</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white md:top-4 md:text-[#6b7077] md:hover:bg-[#f3f1ed]"
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>

          <div className="p-6 md:p-8">
        {step === 'form' ? (
          <>
            {/* ── PASO 1: Formulario de datos ── */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: ACCENT }}>
                Paso {stepNum} de 2
              </p>
              <h2 id={`${fid}-title`} className={`${fraunces.className} mt-1.5 text-[22px] font-medium tracking-[-0.01em]`} style={{ color: INK }}>
                Crea tu cuenta
              </h2>
              <p className="mt-1.5 text-[13px]" style={{ color: MUTED }}>
                Registra tu organización. Te enviaremos un código al correo.
              </p>
            </div>

            <form onSubmit={onSubmitForm} className="mt-5 space-y-3.5" noValidate>
              <LabeledField id={`${fid}-orgName`} label="Nombre de la Organización" required>
                <input
                  id={`${fid}-orgName`}
                  name="organizationName"
                  type="text"
                  required
                  autoFocus
                  placeholder="Centro Cultural de Arte..."
                  maxLength={100}
                  className={inputClass}
                  style={{ borderColor: LINE }}
                />
              </LabeledField>

              <LabeledField id={`${fid}-fullName`} label="Nombre Completo del Administrador" required>
                <input
                  id={`${fid}-fullName`}
                  name="fullName"
                  type="text"
                  required
                  placeholder="Carlos Gómez"
                  maxLength={100}
                  className={inputClass}
                  style={{ borderColor: LINE }}
                />
              </LabeledField>

              <LabeledField id={`${fid}-email`} label="Email del Administrador" required>
                <input
                  id={`${fid}-email`}
                  name="email"
                  type="email"
                  required
                  placeholder="carlos@mi-centro.org"
                  maxLength={255}
                  className={inputClass}
                  style={{ borderColor: LINE }}
                />
              </LabeledField>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <LabeledField id={`${fid}-password`} label="Contraseña" required>
                  <div className="relative">
                    <input
                      id={`${fid}-password`}
                      name="password"
                      type={showPw ? 'text' : 'password'}
                      required
                      placeholder="Mín. 8 caracteres"
                      className={`${inputClass} pr-10`}
                      style={{ borderColor: LINE }}
                    />
                    <button type="button" onClick={() => setShowPw((v) => !v)} className={eyeBtn}
                      aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                      {showPw ? <EyeOff size={16} strokeWidth={2} aria-hidden="true" /> : <Eye size={16} strokeWidth={2} aria-hidden="true" />}
                    </button>
                  </div>
                </LabeledField>
                <LabeledField id={`${fid}-confirmPassword`} label="Confirmar Contraseña" required>
                  <div className="relative">
                    <input
                      id={`${fid}-confirmPassword`}
                      name="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      required
                      placeholder="Repetir contraseña"
                      className={`${inputClass} pr-10`}
                      style={{ borderColor: LINE }}
                    />
                    <button type="button" onClick={() => setShowConfirm((v) => !v)} className={eyeBtn}
                      aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                      {showConfirm ? <EyeOff size={16} strokeWidth={2} aria-hidden="true" /> : <Eye size={16} strokeWidth={2} aria-hidden="true" />}
                    </button>
                  </div>
                </LabeledField>
              </div>

              {errorMsg ? (
                <p role="alert" className="text-[13px] font-medium" style={{ color: '#b91c1c' }}>
                  {errorMsg}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={status === 'submitting'}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-[14.5px] font-semibold text-white transition-opacity disabled:opacity-70"
                style={{ background: ACCENT }}
              >
                {status === 'submitting' ? (
                  <>
                    <Loader2 size={15} strokeWidth={2.25} className="animate-spin" aria-hidden="true" />
                    Enviando código…
                  </>
                ) : (
                  <>
                    Continuar
                    <ArrowRight size={15} strokeWidth={2.25} aria-hidden="true" />
                  </>
                )}
              </button>

              <p className="text-center text-[12px] leading-relaxed" style={{ color: MUTED }}>
                Al registrarte aceptas las condiciones y políticas. <br />
                No se requiere tarjeta de crédito.
              </p>
            </form>
          </>
        ) : (
          <>
            {/* ── PASO 2: Verificación de código ── */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: ACCENT }}>
                Paso {stepNum} de 2
              </p>
              <h2 id={`${fid}-title`} className={`${fraunces.className} mt-1.5 text-[22px] font-medium tracking-[-0.01em]`} style={{ color: INK }}>
                Verifica tu correo
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: MUTED }}>
                Enviamos un código de 6 dígitos a <b style={{ color: INK }}>{maskedEmail}</b>
              </p>
            </div>

            <div className="mt-6">
              {/* Mail icon */}
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full mb-5" style={{ background: 'rgba(230,81,0,0.08)' }}>
                <Mail size={26} strokeWidth={1.8} style={{ color: ACCENT }} aria-hidden="true" />
              </div>

              {/* 6 digit inputs */}
              <div className="flex justify-center gap-2.5">
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { digitRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={d}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                      if (pasted.length === 6) {
                        e.preventDefault();
                        handleDigitChange(i, pasted);
                      }
                    }}
                    className="h-12 w-10 rounded-lg border-2 bg-[#faf9f7] text-center text-[20px] font-bold outline-none transition-all focus:border-[#e65100] focus:shadow-[0_0_0_3px_rgba(230,81,0,0.1)]"
                    style={{ borderColor: d ? ACCENT : LINE, color: INK }}
                    aria-label={`Dígito ${i + 1}`}
                  />
                ))}
              </div>

              {errorMsg ? (
                <p role="alert" className="mt-4 text-center text-[13px] font-medium" style={{ color: '#b91c1c' }}>
                  {errorMsg}
                </p>
              ) : null}

              {status === 'submitting' || status === 'success' ? (
                <div className="mt-5 flex items-center justify-center gap-2 text-[14px] font-medium" style={{ color: MUTED }}>
                  <Loader2 size={16} strokeWidth={2} className="animate-spin" aria-hidden="true" />
                  {status === 'success' ? 'Creando cuenta e ingresando…' : 'Verificando…'}
                </div>
              ) : null}

              <div className="mt-6 flex items-center justify-center gap-1 text-[13px]" style={{ color: MUTED }}>
                <span>¿No recibiste el código?</span>
                {resendCooldown > 0 ? (
                  <span className="font-medium" style={{ color: INK }}>
                    Reenviar en {resendCooldown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onResend}
                    disabled={status === 'submitting'}
                    className="inline-flex items-center gap-1 font-semibold hover:underline disabled:opacity-50"
                    style={{ color: ACCENT }}
                  >
                    <RotateCcw size={13} strokeWidth={2} aria-hidden="true" />
                    Reenviar
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => { setStep('form'); setErrorMsg(null); setStatus('idle'); }}
                className="mt-4 block w-full text-center text-[12.5px] font-medium hover:underline"
                style={{ color: MUTED }}
              >
                ← Volver al formulario
              </button>
            </div>
          </>
        )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
