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
import { Camera, CircleCheck, CircleX, Lock, LogOut, ScanLine, TriangleAlert } from 'lucide-react';
import { isValidCode, normalizeScannedCode } from '../../lib/scanner/code';
import { useQrCamera } from '../../lib/scanner/useQrCamera';
import { classifyCheckin, type CheckinOutcome } from '../../lib/scanner/checkin';
import type { ScannerActivity } from '../../lib/scanner/types';

type Screen = 'pin' | 'select' | 'scan';

interface Props {
  initialAuthed: boolean;
  activities: ScannerActivity[];
  brandName: string;
  logoUrl?: string | null;
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

export function ScannerClient({ initialAuthed, activities, brandName, logoUrl }: Props) {
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
  const { cameraError } = useQrCamera({
    enabled: screen === 'scan',
    videoRef,
    canvasRef,
    onDecode: submitCode,
  });

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
    const slotCount = Math.max(4, pin.length);
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
        <div className="rounded-card border border-line bg-surface p-6 shadow-sm">
          {/* Lock icon */}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand-text">
            <Lock className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.15em] text-muted">{brandName}</p>
          <h1 className="mb-1 text-center text-2xl font-semibold text-ink">Ingresa el PIN de puerta</h1>
          <p className="mb-5 text-center text-sm text-muted">Pídele el PIN a tu coordinador.</p>

          {/* Casillas visuales dinámicas (aria-hidden): una por dígito tecleado, mínimo 4 */}
          <div className="mb-4 flex justify-center gap-2" aria-hidden="true">
            {Array.from({ length: slotCount }, (_, i) => (
              <span
                key={i}
                className={
                  'flex h-12 w-10 items-center justify-center rounded-lg border text-lg font-bold ' +
                  (i < pin.length
                    ? 'border-brand-text bg-brand-soft text-brand-text'
                    : i === pin.length
                    ? 'border-brand bg-surface text-transparent'
                    : 'border-line bg-subtle text-transparent')
                }
              >
                {i < pin.length ? '•' : ''}
              </span>
            ))}
          </div>

          <form onSubmit={submitPin} className="space-y-4">
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              aria-label="PIN del centro"
              className="w-full rounded-xl border border-line bg-subtle px-4 py-3 text-center font-mono text-xl tracking-[0.4em] text-ink outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            {pinError && (
              <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-fg">
                {pinError}
              </p>
            )}
            <button
              type="submit"
              disabled={pin.length < 4 || pinBusy}
              className="w-full rounded-pill bg-brand px-4 py-3.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-95 disabled:opacity-50"
            >
              {pinBusy ? 'Verificando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (screen === 'select') {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Elige actividad</p>
            <h1 className="mt-1 text-xl font-semibold text-ink">¿Qué vas a escanear?</h1>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-pill border border-line px-3 py-2 text-sm text-muted transition hover:bg-subtle hover:text-ink"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Salir
          </button>
        </header>

        {activities.length === 0 ? (
          <div className="mt-10 rounded-card border border-line bg-surface px-5 py-8 text-center text-sm text-muted">
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
                  className="flex w-full items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-4 text-left shadow-sm transition hover:border-brand/40 hover:shadow-md"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{a.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {a.dateLabel} · {a.location}
                    </span>
                  </span>
                  <span className="num shrink-0 text-xs text-muted">
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
      {/* Cabecera: logo + actividad + fecha */}
      <header className="mb-4 flex items-center gap-3">
        <button
          onClick={() => {
            setScreen('select');
            setOutcome(null);
          }}
          className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:bg-subtle"
        >
          ← Actividad
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt={brandName} className="h-8 w-auto shrink-0 object-contain" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink leading-tight">{selected?.name}</p>
            <p className="truncate text-xs text-muted">{selected?.dateLabel}</p>
          </div>
        </div>
        <button
          onClick={logout}
          aria-label="Cerrar sesión"
          className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:bg-subtle"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {/* Visor de cámara */}
      <div className="relative aspect-square w-full overflow-hidden rounded-card bg-ink">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        {/* Marco guía + texto de ayuda */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="h-2/3 w-2/3 rounded-[20px] border-[3px] border-brand shadow-[0_0_0_999px_rgba(0,0,0,0.3)]" />
          <span className="rounded-full bg-ink/80 px-3 py-1 text-xs text-white">
            Apunta la cámara al código QR del pase
          </span>
        </div>
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/70 px-6 text-center">
            <Camera className="h-8 w-8 text-white/60" aria-hidden="true" />
            <p className="text-sm text-white/80">{cameraError}</p>
          </div>
        )}
      </div>

      {/* Resultado */}
      {outcome && <OutcomeBanner outcome={outcome} />}

      {/* Entrada manual de respaldo */}
      <form onSubmit={onManualSubmit} className="mt-auto pt-6">
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
          Entrada manual
        </label>
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            placeholder="Escribe el código del pase"
            aria-label="Código manual"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-3 font-mono text-sm tracking-wider text-ink outline-none placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          />
          <button
            type="submit"
            disabled={submitting || !manual.trim()}
            className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-95 disabled:opacity-50"
          >
            Registrar
          </button>
        </div>
      </form>
    </div>
  );
}

const PROTOCOL_CATEGORY: Record<string, string> = {
  autoridad: 'Autoridad', diplomatico: 'Diplomático', prensa: 'Prensa',
  patrocinador: 'Patrocinador', directivo: 'Directivo', artista: 'Artista', otro: 'Invitado especial',
};

// Sufijo estable de data-testid para e2e (scanner-result-{ok|dup|invalid|full|error}).
const TESTID_BY_KIND: Record<CheckinOutcome['kind'], string> = {
  success: 'ok',
  already: 'dup',
  full: 'full',
  'not-found': 'invalid',
  invalid: 'invalid',
  error: 'error',
};

function OutcomeBanner({ outcome }: { outcome: CheckinOutcome }) {
  type StyleEntry = { box: string; icon: string; Icon: typeof CircleCheck };
  const styles: Record<CheckinOutcome['kind'], StyleEntry> = {
    success: {
      box: 'bg-success-bg border-[3px] border-success-fg/30 text-success-fg',
      icon: 'text-success-fg',
      Icon: CircleCheck,
    },
    already: {
      box: 'bg-warning-bg border-[3px] border-warning-fg/30 text-warning-fg',
      icon: 'text-warning-fg',
      Icon: TriangleAlert,
    },
    full: {
      box: 'bg-danger-bg border-[3px] border-danger-fg/30 text-danger-fg',
      icon: 'text-danger-fg',
      Icon: CircleX,
    },
    'not-found': {
      box: 'bg-danger-bg border-[3px] border-danger-fg/30 text-danger-fg',
      icon: 'text-danger-fg',
      Icon: CircleX,
    },
    invalid: {
      box: 'bg-danger-bg border-[3px] border-danger-fg/30 text-danger-fg',
      icon: 'text-danger-fg',
      Icon: CircleX,
    },
    error: {
      box: 'bg-danger-bg border-[3px] border-danger-fg/30 text-danger-fg',
      icon: 'text-danger-fg',
      Icon: CircleX,
    },
  };
  const { box, icon, Icon } = styles[outcome.kind];
  return (
    <div
      role="status"
      data-testid={`scanner-result-${TESTID_BY_KIND[outcome.kind]}`}
      className={`mt-4 flex items-start gap-3 rounded-xl px-4 py-3 ${box}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${icon}`} aria-hidden="true" />
      <div className="min-w-0">
        {/* PROTOCOLO (PR-5): recibimiento distinguido, antes que el resto. */}
        {outcome.kind === 'success' && outcome.data?.protocol ? (
          <p className="mb-1 inline-flex items-center gap-1.5 rounded-md bg-warning-bg px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-warning-fg">
            ★ Protocolo · {outcome.data.protocol.honorific ?? PROTOCOL_CATEGORY[outcome.data.protocol.category] ?? outcome.data.protocol.category}
            {outcome.data.protocol.plusOnes > 0 ? ` · +${outcome.data.protocol.plusOnes} acompañantes` : ''}
          </p>
        ) : null}
        <p className={outcome.kind === 'success' ? 'text-[17px] font-bold leading-snug' : 'font-semibold'}>{outcome.title}</p>
        {outcome.kind === 'success' && outcome.data ? (
          <p className="num text-sm">
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
