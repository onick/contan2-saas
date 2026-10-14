// Primitivas visuales del kiosko · tema claro institucional, tablet-first,
// touch targets grandes (≥56 px). Separadas de components/ui (admin).
// Usa tokens del sistema (--color-brand, --color-ink, etc.) — sin hex hardcoded.

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Hand, ArrowLeft, ArrowRight } from 'lucide-react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// Conservado para compatibilidad con cualquier consumidor externo; screens.tsx
// ya no lo usa — aplica `font-mono` o `.num` según el contexto.
export const kioskMono: CSSProperties = {
  fontFamily: 'var(--font-plex-mono), ui-monospace, "SF Mono", Menlo, monospace',
};

// Anillo de foco sobre fondo claro (page). Token --color-focus cumple 3:1 WCAG.
export const kioskFocus =
  'outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page';

type KioskButtonVariant = 'primary' | 'secondary' | 'ghost';
type KioskButtonSize = 'lg' | 'xl';

const VARIANT: Record<KioskButtonVariant, string> = {
  // bg-brand (#f39228) + text-brand-fg (#1f2326 oscuro) → contraste 6.75:1 (AAA).
  primary: 'bg-brand text-brand-fg hover:brightness-[1.05] active:brightness-95',
  secondary: 'bg-surface text-ink border border-line hover:bg-subtle',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-subtle',
};

const SIZE: Record<KioskButtonSize, string> = {
  lg: 'min-h-14 px-7 text-lg',
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
        'inline-flex items-center justify-center gap-3 rounded-full font-semibold tracking-tight motion-safe:transition-colors',
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

// CTA "ticket" del welcome: banda ancha naranja con Hand + título + subtítulo + flecha.
// Nombre accesible = prop `label` (aria-label). Prop `eyebrow` conservada pero no renderizada.
export function TicketButton({ label, eyebrow: _eyebrow, onClick }: { label: string; eyebrow?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        'kiosk-pulse group relative inline-flex w-full max-w-[540px] items-center overflow-hidden rounded-[20px]',
        'bg-brand text-brand-fg shadow-lg motion-safe:transition-transform active:scale-[0.99]',
        kioskFocus,
      )}
    >
      <span aria-hidden="true" className="flex flex-none items-center justify-center py-5 pl-6 pr-4">
        <Hand size={28} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="flex flex-1 flex-col items-start justify-center gap-0.5 py-5 text-left">
        <span className="text-3xl font-bold leading-tight">{label}</span>
        <span className="text-sm font-normal text-brand-fg">Te toma menos de un minuto</span>
      </span>
      <span aria-hidden="true" className="flex flex-none items-center pl-2 pr-6 motion-safe:transition-transform motion-safe:duration-200 group-hover:translate-x-1">
        <ArrowRight size={24} strokeWidth={2} aria-hidden="true" />
      </span>
    </button>
  );
}

// Pill de "volver atrás". Touch target ≥44 px (min-h-11).
export function KioskBackPill({ label = 'Atrás', onClick }: { label?: string; onClick?: () => void }) {
  return (
    <div className="mt-10 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className={cx(
          'inline-flex min-h-11 items-center gap-2.5 rounded-full border border-line bg-surface px-7',
          'text-sm font-medium text-muted motion-safe:transition-colors hover:bg-subtle hover:text-ink',
          kioskFocus,
        )}
      >
        <ArrowLeft size={18} aria-hidden="true" /> {label}
      </button>
    </div>
  );
}

// QR DEMO (placeholder honesto). Negro (--color-ink) sobre blanco con margen de
// silencio (p-3). El QR real lo genera el servidor (RealQr en screens.tsx).
export function FauxQr({ code, size = 196 }: { code: string; size?: number }) {
  const N = 21;
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
            style={{ backgroundColor: fill ? 'var(--color-ink)' : 'transparent' }}
          />
        );
      })}
      <span className="absolute -bottom-2 -right-2 rounded-md bg-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-fg">
        Demo
      </span>
    </div>
  );
}
