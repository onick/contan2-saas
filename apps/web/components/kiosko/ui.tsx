// Primitivas visuales del kiosko · tema OSCURO institucional, tablet-first,
// touch targets grandes (≥56px). Separadas de components/ui (que son claras y
// para el admin). Aquí no se usa el shell admin ni sus tokens de superficie.

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Ticket } from 'lucide-react';

// Paleta oscura del kiosko (constante local; no contamina @theme). El naranja
// de marca (#e65100/#ff6f00) se mantiene como único acento.
export const KIOSK = {
  bg: '#0e0f14',
  surface: '#191b22',
  surfaceHi: '#22242e',
  line: 'rgba(255,255,255,0.10)',
  ink: '#f4f5f8',
  muted: '#a2a5b4',
  faint: '#71748a',
  brand: '#ff6f00',
  brandFill: '#e65100',
};

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// Estilo mono (eyebrows/fechas/etiquetas). La var la inyecta el layout del kiosko.
export const kioskMono: CSSProperties = {
  fontFamily: 'var(--font-roboto-mono), ui-monospace, "SF Mono", Menlo, monospace',
};

// Anillo de foco visible sobre fondo oscuro (WCAG 1.4.11).
export const kioskFocus =
  'outline-none focus-visible:ring-2 focus-visible:ring-[#ff6f00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0f14]';

type KioskButtonVariant = 'primary' | 'secondary' | 'ghost';
type KioskButtonSize = 'lg' | 'xl';

const VARIANT: Record<KioskButtonVariant, string> = {
  // Texto blanco grande+bold sobre #e65100 = 3.79:1 → cumple el 3:1 de texto grande.
  primary: 'bg-[#e65100] text-white hover:bg-[#ff6f00] active:bg-[#cc4800]',
  secondary: 'bg-[#22242e] text-[#f4f5f8] border border-white/12 hover:bg-[#2b2e3a]',
  ghost: 'bg-transparent text-[#a2a5b4] hover:text-[#f4f5f8] hover:bg-white/5',
};

const SIZE: Record<KioskButtonSize, string> = {
  lg: 'min-h-[56px] px-7 text-lg',
  xl: 'min-h-[72px] px-9 text-xl',
};

export interface KioskButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: KioskButtonVariant;
  size?: KioskButtonSize;
  children: ReactNode;
}

export function KioskButton({
  variant = 'primary',
  size = 'lg',
  className,
  children,
  ...props
}: KioskButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-3 rounded-2xl font-semibold tracking-tight transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        kioskFocus,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// CTA "ticket" del welcome (stub perforado + cuerpo + flecha), en naranja de
// marca, con muescas laterales (círculos del color del fondo) y pulso suave.
// Es la pieza de mayor "nivel" del kiosko, inspirada en el ticket de v1.
export function TicketButton({ label, eyebrow = 'Admit one', onClick }: { label: string; eyebrow?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        'kiosk-pulse group relative inline-flex h-[96px] w-full max-w-[520px] items-stretch overflow-hidden rounded-xl',
        'bg-[linear-gradient(180deg,#ff6f00_0%,#e65100_100%)] text-white',
        'ring-1 ring-inset ring-white/15 transition-transform active:scale-[0.99]',
        kioskFocus,
      )}
    >
      {/* Muescas laterales (color del fondo) — efecto ticket recortado */}
      <span aria-hidden="true" className="absolute -left-[11px] top-1/2 h-[22px] w-[22px] -translate-y-1/2 rounded-full bg-[#0b0e14]" />
      <span aria-hidden="true" className="absolute -right-[11px] top-1/2 h-[22px] w-[22px] -translate-y-1/2 rounded-full bg-[#0b0e14]" />

      {/* Stub: ícono + número, con perforación dashed a la derecha */}
      <span className="relative flex w-[96px] flex-none flex-col items-center justify-center gap-1 bg-white/10">
        <Ticket size={34} strokeWidth={1.6} aria-hidden="true" className="text-white/90" />
        <span style={kioskMono} className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">01</span>
        <span aria-hidden="true" className="absolute right-0 top-4 bottom-4 border-r-2 border-dashed border-white/30" />
      </span>

      {/* Cuerpo: eyebrow + label */}
      <span className="flex flex-1 flex-col items-start justify-center gap-1 px-7 text-left">
        <span style={kioskMono} className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/60">{eyebrow}</span>
        <span className="text-lg font-extrabold uppercase tracking-[0.06em] sm:text-xl">{label}</span>
      </span>

      {/* Flecha */}
      <span aria-hidden="true" className="flex flex-none items-center pr-7 text-3xl font-light text-white/90 transition-transform group-hover:translate-x-1">→</span>
    </button>
  );
}

// QR DEMO (placeholder honesto). Patrón determinista derivado del código —
// parece un QR para el mockup pero NO codifica nada real. El QR real se genera
// server-side (sharp + qrcode, codifica user.code) en el PR de escrituras.
export function FauxQr({ code, size = 196 }: { code: string; size?: number }) {
  const N = 21; // módulos por lado (como un QR v1)
  // Hash determinista → bits de relleno.
  let h = 2166136261;
  for (let i = 0; i < code.length; i += 1) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const cells: boolean[] = [];
  for (let i = 0; i < N * N; i += 1) {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    cells.push((h & 7) > 3);
  }
  const isFinder = (r: number, c: number) => {
    const inBox = (br: number, bc: number) => r >= br && r < br + 7 && c >= bc && c < bc + 7;
    return inBox(0, 0) || inBox(0, N - 7) || inBox(N - 7, 0);
  };
  const finderOn = (r: number, c: number) => {
    const within = (br: number, bc: number) => {
      const lr = r - br, lc = c - bc;
      const ring = lr === 0 || lr === 6 || lc === 0 || lc === 6;
      const core = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
      return ring || core;
    };
    if (r < 7 && c < 7) return within(0, 0);
    if (r < 7 && c >= N - 7) return within(0, N - 7);
    if (r >= N - 7 && c < 7) return within(N - 7, 0);
    return false;
  };

  return (
    <div
      className="relative grid rounded-xl bg-white p-3"
      style={{ gridTemplateColumns: `repeat(${N}, 1fr)`, width: size, height: size }}
      role="img"
      aria-label="Código QR de demostración"
    >
      {cells.map((on, idx) => {
        const r = Math.floor(idx / N);
        const c = idx % N;
        const fill = isFinder(r, c) ? finderOn(r, c) : on;
        return (
          <span
            key={idx}
            className="aspect-square"
            style={{ backgroundColor: fill ? '#0e0f14' : 'transparent' }}
          />
        );
      })}
      <span className="absolute -bottom-2 -right-2 rounded-md bg-[#e65100] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
        Demo
      </span>
    </div>
  );
}
