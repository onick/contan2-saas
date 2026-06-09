'use client';

// apps/web/components/checkin/CheckinScanModal.tsx · escáner de credencial para la
// consola de check-in admin (Check-in C). A diferencia del scanner de staff
// (/scanner, que registra directo), acá el QR sólo RESUELVE al visitante: lee el
// código de la credencial y lo entrega vía onDetect para que la consola lo
// busque/seleccione en "Encontrar visitante". El staff luego elige la actividad.
//
// Reusa el motor cámara+jsQR probado (lib/scanner/useQrCamera) y la validación
// client-safe (lib/scanner/code). Incluye entrada manual de respaldo porque la
// consola admin corre en desktop/tablet y muchos equipos no tienen cámara
// trasera. a11y: dialog modal, Escape cierra, foco al abrir, aria-live.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ScanLine, X } from 'lucide-react';
import { useQrCamera } from '../../lib/scanner/useQrCamera';
import { isValidCode, normalizeScannedCode } from '../../lib/scanner/code';
import { Button, IconButton, cn, focusRing } from '../ui';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Código de credencial canónico (<PREFIX>-XXXXXX) ya normalizado y validado. */
  onDetect: (code: string) => void;
}

function buzz(kind: 'ok' | 'bad'): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(kind === 'ok' ? 70 : [50, 40, 50]);
  }
}

export function CheckinScanModal({ open, onClose, onDetect }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const flashHint = useCallback((m: string) => {
    setHint(m);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 1800);
  }, []);

  // Normaliza + valida ANTES de entregar: un QR inválido no selecciona a nadie.
  const accept = useCallback(
    (raw: string) => {
      const code = normalizeScannedCode(raw);
      if (!isValidCode(code)) {
        flashHint(`Código no válido: ${code || '—'}`);
        buzz('bad');
        return;
      }
      buzz('ok');
      onDetect(code);
    },
    [flashHint, onDetect],
  );

  const { cameraError } = useQrCamera({ enabled: open, videoRef, canvasRef, onDecode: accept });

  // Escape cierra + scroll-lock + foco inicial al botón de cerrar.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Limpia el timer del hint al desmontar.
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);

  if (!open || typeof document === 'undefined') return null;

  function onManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = manual.trim();
    if (!v) return;
    setManual('');
    accept(v);
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="scan-title">
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-ink/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0e] text-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 id="scan-title" className="flex items-center gap-2 text-sm font-semibold">
            <ScanLine size={16} strokeWidth={2} aria-hidden="true" className="text-[#ff6f00]" />
            Escanear credencial
          </h2>
          <IconButton autoFocus label="Cerrar escáner" variant="ghost" size="sm" onClick={onClose} className="text-white/70 hover:bg-white/10 hover:text-white">
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        {/* Visor de cámara */}
        <div className="relative aspect-square w-full overflow-hidden bg-black">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-2/3 w-2/3 rounded-2xl border-2 border-[#ff6f00]/70 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
          </div>
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 px-6 text-center">
              <Camera size={28} aria-hidden="true" className="text-white/60" />
              <p className="text-sm text-white/80">{cameraError}</p>
            </div>
          ) : null}
        </div>

        <div className="px-4 py-4">
          <p role="status" aria-live="polite" className="flex min-h-5 items-center justify-center gap-2 text-center text-xs text-white/55">
            {hint ? <span className="font-medium text-red-300">{hint}</span> : <>Apunta al QR de la credencial</>}
          </p>

          {/* Entrada manual de respaldo (desktop sin cámara) */}
          <form onSubmit={onManualSubmit} className="mt-3 flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value.toUpperCase())}
              placeholder="CCB-XXXXXX"
              aria-label="Código de credencial manual"
              autoComplete="off"
              className={cn(
                'min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 font-mono text-sm tracking-wider text-white placeholder:text-white/35 outline-none',
                'focus:border-[#ff6f00] focus:ring-2 focus:ring-[#ff6f00]/40',
              )}
            />
            <Button type="submit" disabled={!manual.trim()} className={focusRing}>Usar código</Button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
