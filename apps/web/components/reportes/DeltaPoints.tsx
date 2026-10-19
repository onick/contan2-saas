// Variación en PUNTOS porcentuales (p. ej. ocupación 6% vs 10% = −4 pp).
// Mismo lenguaje visual que DeltaPct (charts/primitives) pero con unidad "pp".
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '../ui';

export function DeltaPoints({ pts }: { pts: number | null }) {
  if (pts === null) return <span className="text-[12px] font-bold text-faint">—</span>;
  const up = pts > 0;
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 text-[12px] font-bold', pts === 0 ? 'text-faint' : up ? 'text-success-fg' : 'text-danger-fg')}
      title="Variación en puntos porcentuales"
    >
      {pts !== 0 && (up ? <ArrowUp size={12} strokeWidth={2.75} /> : <ArrowDown size={12} strokeWidth={2.75} />)}{Math.abs(pts)} pp
    </span>
  );
}
