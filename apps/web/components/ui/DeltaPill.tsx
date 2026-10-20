import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from './cn';

export interface DeltaPillProps {
  // Variación respecto del período anterior. null = sin dato comparable ("—").
  value: number | null;
  // 'pct' (por defecto) → "+5%"; 'points' → "+4 pp" (puntos porcentuales).
  unit?: 'pct' | 'points';
  // Sobre fondo oscuro (tarjeta protagonista): píldora blanca translúcida.
  onDark?: boolean;
  // Texto solo para lectores de pantalla (p. ej. "vs período anterior").
  hint?: string;
  className?: string;
}

const BASE = 'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold tabular-nums';

const TONE = {
  up:   'bg-success-bg text-success-fg',
  down: 'bg-danger-bg text-danger-fg',
  flat: 'bg-surface-container text-muted',
} as const;

// Pastilla de variación reutilizable: verde ↗ sube, rojo ↘ baja, gris en 0/sin dato.
export function DeltaPill({ value, unit = 'pct', onDark = false, hint, className }: DeltaPillProps) {
  const dir = value === null || value === 0 ? 'flat' : value > 0 ? 'up' : 'down';
  const tone = onDark ? 'bg-white/15 text-white' : TONE[dir];
  const text =
    value === null ? '—'
    : `${value > 0 ? '+' : ''}${value}${unit === 'points' ? ' pp' : '%'}`;
  return (
    <span
      data-dir={dir}
      className={cn(BASE, tone, className)}
      title={unit === 'points' ? 'Variación en puntos porcentuales' : undefined}
    >
      {dir === 'up' ? <ArrowUpRight size={12} strokeWidth={2.5} aria-hidden="true" /> : null}
      {dir === 'down' ? <ArrowDownRight size={12} strokeWidth={2.5} aria-hidden="true" /> : null}
      {text}
      {hint ? <span className="sr-only"> {hint}</span> : null}
    </span>
  );
}
