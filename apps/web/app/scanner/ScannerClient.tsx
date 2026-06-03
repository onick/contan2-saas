'use client';

// app/scanner/ScannerClient.tsx · máquina de estados del scanner de staff.
//
//   pin  → ingreso del PIN del tenant (POST /scanner/api/pin → cookie firmada)
//   select → elegir actividad (actividades públicas reales)
//   scan → visor de cámara (getUserMedia + jsQR) + entrada manual de respaldo
//
// El escaneo normaliza y valida el código ANTES de postear (un QR inválido NO
// dispara red); cooldown de 2200ms entre lecturas de cámara para no repetir.
// El check-in real lo arbitra api-v2 (cupo atómico, duplicado); acá sólo se
// pinta el resultado con color + vibración. No se muestra PII: del éxito sólo
// se usa el código y el número de visita que devuelve la respuesta.

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, Check, LogOut, ScanLine, TriangleAlert, X } from 'lucide-react';
import { isValidCode, normalizeScannedCode } from '../../lib/scanner/code';
import { classifyCheckin, type CheckinOutcome } from '../../lib/scanner/checkin';
import type { ScannerActivity } from '../../lib/scanner/types';

const SCAN_COOLDOWN_MS = 2200;

type Screen = 'pin' | 'select' | 'scan';

interface Props {
  initialAuthed: boolean;
  activities: ScannerActivity[];
  brandName: string;
}

function pinErrorFor(status: number): string {
  if (status === 400) return 'El PIN debe tener de 4 a 8 dígitos.';
  if (status === 401) return 'PIN incorrecto. Verifícalo e intenta de nuevo.';
  if (status === 403) return 'El scanner no está configurado para este centro.';
  if (status === 429) return 'Demasiados intentos. Espera un momento.';
  return 'No pudimos conectar. Intenta de nuevo.';
}

function buzz(kind: 'ok' | 'bad'): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(kind === 'ok' ? 70 : [50, 40, 50]);
  }
}

export function ScannerClient({ initialAuthed, activities, brandName }: Props) {
  const [screen, setScreen] = useState<Screen>(initialAuthed ? 'select' : 'pin');
  const [selected, setSelected] = useState<ScannerActivity | null>(null);

  // ─ PIN ─
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  // ─ Escaneo ─
  const [manual, setManual] = useState('');
  const [outcome, setOutcome] = useState<CheckinOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastScanRef = useRef(0);
  const busyRef = useRef(false);

  // ── PIN: login ──────────────────────────────────────────────────────────
  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    if (pinBusy) return;
    setPinBusy(true);
    setPinError(null);
    try {
      const res = await fetch('/scanner/api/pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.status === 200) {
        setPin('');
        setScreen('select');
      } else {
        setPinError(pinErrorFor(res.status));
      }
    } catch {
      setPinError(pinErrorFor(0));
    } finally {
      setPinBusy(false);
    }
  }

  async function logout() {
    try {
      await fetch('/scanner/api/logout', { method: 'POST' });
    } catch {
      /* el back ya pudo limpiar; volvemos al PIN igual */
    }
    setSelected(null);
    setOutcome(null);
    setScreen('pin');
  }

  // ── Check-in: validar → postear → clasificar ────────────────────────────
  const submitCode = useCallback(
    async (raw: string) => {
      const code = normalizeScannedCode(raw);
      if (!isValidCode(code)) {
        setOutcome({ kind: 'invalid', title: 'Código inválido', detail: code || '—' });
        buzz('bad');
        return;
      }
      if (busyRef.current || !selected) return;
      busyRef.current = true;
      setSubmitting(true);
      try {
        const res = await fetch('/scanner/api/checkin', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ activityId: selected.id, visitor: { code }, companionsChildren: 0 }),
        });
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* respuesta sin JSON → cae a error genérico abajo */
        }
        const result = classifyCheckin(res.status, body);
        setOutcome(result);
        buzz(result.kind === 'success' ? 'ok' : 'bad');
      } catch {
        setOutcome({ kind: 'error', title: 'Error de red', detail: 'No pudimos registrar. Intenta de nuevo.' });
        buzz('bad');
      } finally {
        busyRef.current = false;
        setSubmitting(false);
      }
    },
    [selected],
  );

  function onManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = manual.trim();
    if (!v) return;
    setManual('');
    void submitCode(v);
  }

  // ── Cámara: getUserMedia + loop jsQR (sólo en pantalla de escaneo) ───────
  useEffect(() => {
    if (screen !== 'scan') return;
    let raf = 0;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCameraError(null);

    const onDecode = (raw: string) => {
      const now = Date.now();
      if (now - lastScanRef.current < SCAN_COOLDOWN_MS) return;
      lastScanRef.current = now;
      void submitCode(raw);
    };

    function loop() {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const found = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      if (found?.data) onDecode(found.data);
    }

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Cámara no disponible. Usa la entrada manual.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch {
        setCameraError('No pudimos acceder a la cámara. Revisa los permisos o usa la entrada manual.');
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      loop();
    }

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [screen, submitCode]);

  // El banner de resultado se limpia solo tras unos segundos (salvo invalid/error
  // que conviene que persistan un poco más). Mantiene el visor despejado.
  useEffect(() => {
    if (!outcome) return;
    const ms = outcome.kind === 'success' || outcome.kind === 'already' ? 3500 : 5000;
    const id = setTimeout(() => setOutcome(null), ms);
    return () => clearTimeout(id);
  }, [outcome]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (screen === 'pin') {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
        <div className="mb-10 text-center">
          <ScanLine className="mx-auto mb-4 h-10 w-10 text-[#ff6f00]" aria-hidden="true" />
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#ff6f00]">Acceso de staff</p>
          <h1 className="mt-2 text-2xl font-semibold">Scanner</h1>
          <p className="mt-1 text-sm text-white/55">{brandName}</p>
        </div>
        <form onSubmit={submitPin} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white/80">PIN del centro</span>
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              aria-label="PIN del centro"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-center font-mono text-2xl tracking-[0.4em] text-white outline-none focus:border-[#ff6f00] focus:ring-2 focus:ring-[#ff6f00]/40"
            />
          </label>
          {pinError && (
            <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">
              {pinError}
            </p>
          )}
          <button
            type="submit"
            disabled={pin.length < 4 || pinBusy}
            className="w-full rounded-xl bg-[#e65100] px-4 py-3.5 font-semibold text-white transition enabled:hover:bg-[#c44400] disabled:opacity-40"
          >
            {pinBusy ? 'Verificando…' : 'Entrar'}
          </button>
        </form>
      </div>
    );
  }

  if (screen === 'select') {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#ff6f00]">Elige actividad</p>
            <h1 className="mt-1 text-xl font-semibold">¿Qué vas a escanear?</h1>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-white/70 transition hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Salir
          </button>
        </header>

        {activities.length === 0 ? (
          <div className="mt-10 rounded-xl border border-white/10 bg-white/5 px-5 py-8 text-center text-sm text-white/60">
            No hay actividades con cupo disponible ahora mismo.
          </div>
        ) : (
          <ul className="space-y-3">
            {activities.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => {
                    setSelected(a);
                    setOutcome(null);
                    setScreen('scan');
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-left transition hover:border-[#ff6f00]/50 hover:bg-white/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-white">{a.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-white/55">
                      {a.dateLabel} · {a.location}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-white/45">
                    {a.enrolledCount}/{a.capacity}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // screen === 'scan'
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={() => {
            setScreen('select');
            setOutcome(null);
          }}
          className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/70 transition hover:bg-white/5"
        >
          ← Actividad
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-white/85">
          {selected?.name}
        </span>
        <button
          onClick={logout}
          aria-label="Cerrar sesión"
          className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/70 transition hover:bg-white/5"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {/* Visor de cámara */}
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        {/* Marco guía */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-2/3 w-2/3 rounded-2xl border-2 border-[#ff6f00]/70 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
        </div>
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-6 text-center">
            <Camera className="h-8 w-8 text-white/60" aria-hidden="true" />
            <p className="text-sm text-white/80">{cameraError}</p>
          </div>
        )}
      </div>

      <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-white/45">
        <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
        Apunta al código QR del visitante
      </p>

      {/* Resultado */}
      {outcome && <OutcomeBanner outcome={outcome} />}

      {/* Entrada manual de respaldo */}
      <form onSubmit={onManualSubmit} className="mt-auto pt-6">
        <label className="mb-2 block text-xs uppercase tracking-wide text-white/45">Entrada manual</label>
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            placeholder="CCB-XXXXXX"
            aria-label="Código manual"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-3 font-mono text-sm tracking-wider text-white outline-none focus:border-[#ff6f00] focus:ring-2 focus:ring-[#ff6f00]/40"
          />
          <button
            type="submit"
            disabled={submitting || !manual.trim()}
            className="rounded-xl bg-[#e65100] px-4 py-3 text-sm font-semibold text-white transition enabled:hover:bg-[#c44400] disabled:opacity-40"
          >
            Registrar
          </button>
        </div>
      </form>
    </div>
  );
}

// Banner de resultado con color fuerte por estado.
function OutcomeBanner({ outcome }: { outcome: CheckinOutcome }) {
  const styles: Record<CheckinOutcome['kind'], { box: string; Icon: typeof Check }> = {
    success: { box: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100', Icon: Check },
    already: { box: 'bg-amber-500/20 border-amber-400/40 text-amber-100', Icon: TriangleAlert },
    full: { box: 'bg-red-500/20 border-red-400/40 text-red-100', Icon: X },
    'not-found': { box: 'bg-red-500/20 border-red-400/40 text-red-100', Icon: X },
    invalid: { box: 'bg-red-500/20 border-red-400/40 text-red-100', Icon: X },
    error: { box: 'bg-red-500/20 border-red-400/40 text-red-100', Icon: X },
  };
  const { box, Icon } = styles[outcome.kind];
  return (
    <div role="status" className={`mt-4 flex items-start gap-3 rounded-xl border px-4 py-3 ${box}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">{outcome.title}</p>
        {outcome.kind === 'success' && outcome.data ? (
          <p className="font-mono text-sm">
            {outcome.data.code} · visita N.º {outcome.data.visitCount}
            {outcome.data.partySize > 1 ? ` · ${outcome.data.partySize} personas` : ''}
          </p>
        ) : (
          <p className="truncate text-sm opacity-90">{outcome.detail}</p>
        )}
      </div>
    </div>
  );
}
