'use client';

// components/marketing/ContactModal.tsx · modal del formulario de contacto de
// la landing. POST /api/contact (proxy → api-v2). Estados: idle / submitting /
// success / error. Honeypot `fax` oculto para bots. Accesible: role=dialog,
// aria-modal, Escape cierra, backdrop NO cierra (anti-pérdida, CONSTITUTION
// §5.4). Paleta de la landing (tinta + naranja), no la del admin.

import { useState, useEffect, useId, type FormEvent, type ReactNode } from 'react';
import { X, Send, CheckCircle2, Loader2 } from 'lucide-react';

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

export function ContactModal({ open, onClose }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fid = useId();
  const nameId = `${fid}-name`;
  const orgId = `${fid}-org`;
  const emailId = `${fid}-email`;
  const messageId = `${fid}-message`;
  const faxId = `${fid}-fax`;

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

  // Reset al cerrar (próxima apertura arranca limpia).
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
    const payload = {
      name: String(fd.get('name') ?? ''),
      organization: String(fd.get('organization') ?? ''),
      email: String(fd.get('email') ?? ''),
      message: String(fd.get('message') ?? ''),
      fax: String(fd.get('fax') ?? ''), // honeypot
    };
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus('success');
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErrorMsg(data.error ?? 'Algo salió mal. Intentá de nuevo.');
      setStatus('error');
    } catch {
      setErrorMsg('No pudimos conectar. Intentá de nuevo.');
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
        {status === 'success' ? (
          <div className="py-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'rgba(29,164,98,0.12)' }}>
              <CheckCircle2 size={26} strokeWidth={2} style={{ color: '#1da462' }} aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-[18px] font-semibold" style={{ color: INK }}>
              ¡Gracias!
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed" style={{ color: MUTED }}>
              Recibimos tu solicitud y te responderemos en menos de 24 horas hábiles con una propuesta y un enlace para agendar la demo.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 inline-flex items-center rounded-full px-5 py-2.5 text-[14px] font-semibold text-white"
              style={{ background: INK }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={`${fid}-title`} className="text-[18px] font-semibold" style={{ color: INK }}>
                  Solicitar demo
                </h2>
                <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
                  Contanos sobre tu centro y te escribimos.
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
              {/* Honeypot: oculto visualmente, off-screen. Si un bot lo llena, api-v2 descarta. */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
                <label htmlFor={faxId}>No llenar</label>
                <input id={faxId} name="fax" type="text" tabIndex={-1} autoComplete="off" />
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <LabeldField id={nameId} label="Nombre" required>
                  <input
                    id={nameId}
                    name="name"
                    type="text"
                    required
                    autoFocus
                    autoComplete="name"
                    placeholder="María López"
                    minLength={2}
                    maxLength={120}
                    className={inputClass}
                    style={{ borderColor: LINE }}
                  />
                </LabeldField>
                <LabeldField id={orgId} label="Organización" required>
                  <input
                    id={orgId}
                    name="organization"
                    type="text"
                    required
                    autoComplete="organization"
                    placeholder="Centro Cultural…"
                    minLength={2}
                    maxLength={160}
                    className={inputClass}
                    style={{ borderColor: LINE }}
                  />
                </LabeldField>
              </div>

              <LabeldField id={emailId} label="Email" required>
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="maria@centro.do"
                  maxLength={255}
                  className={inputClass}
                  style={{ borderColor: LINE }}
                />
              </LabeldField>

              <LabeldField id={messageId} label="Mensaje" required={false}>
                <textarea
                  id={messageId}
                  name="message"
                  rows={3}
                  maxLength={2000}
                  placeholder="Contanos qué tipo de centro tenés y cuántas visitas mensuales…"
                  className={`${inputClass} resize-none`}
                  style={{ borderColor: LINE }}
                />
              </LabeldField>

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
                    Enviando…
                  </>
                ) : (
                  <>
                    Enviar solicitud
                    <Send size={15} strokeWidth={2.25} aria-hidden="true" />
                  </>
                )}
              </button>

              <p className="text-center text-[12px]" style={{ color: MUTED }}>
                Te responderemos en menos de 24 horas hábiles.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
