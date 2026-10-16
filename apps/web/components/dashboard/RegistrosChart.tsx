'use client';

import { useRef, useState } from 'react';
import { Card } from '../ui';
import { cn } from '../ui/cn';
import { useDataAnim } from '../charts/useDataAnim';
import { numero } from '../../lib/format';

interface Props {
  series: { date: string; value: number }[];
}

const fmtDdMm = (ymd: string) => {
  const p = ymd.split('-');
  return `${p[2]}/${p[1]}`;
};

// Agrega la serie en buckets de `step` días (suma de valores, etiqueta = primer día).
// Mantiene ≤maxBars barras sin perder la resolución cuando hay pocos puntos.
function sampleSeries(
  raw: Props['series'],
  maxBars = 30,
): { label: string; value: number }[] {
  if (raw.length === 0) return [];
  if (raw.length <= maxBars) {
    return raw.map((p) => ({ label: fmtDdMm(p.date), value: p.value }));
  }
  const step = Math.ceil(raw.length / maxBars);
  const result: { label: string; value: number }[] = [];
  for (let i = 0; i < raw.length; i += step) {
    const chunk = raw.slice(i, i + step);
    result.push({
      label: fmtDdMm(chunk[0]!.date),
      value: chunk.reduce((a, b) => a + b.value, 0),
    });
  }
  return result;
}

export function RegistrosChart({ series }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  useDataAnim(rootRef, series);

  const items = sampleSeries(series);
  // Rotular como mucho ~12 etiquetas del eje (1 de cada labelStep).
  const labelStep = items.length > 12 ? Math.ceil(items.length / 12) : 1;
  const empty = items.length === 0 || items.every((i) => i.value === 0);
  const peak = empty ? -1 : items.reduce((b, it, i) => (it.value > items[b]!.value ? i : b), 0);
  const max = empty ? 1 : Math.max(1, ...items.map((i) => i.value));

  return (
    <Card padding="lg">
      <div ref={rootRef}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
          Asistencias
        </p>
        <div className="mt-1 flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 flex-none rounded-sm"
              style={{ background: 'var(--color-brand)' }}
            />
            Asistencias
          </span>
        </div>

        {empty ? (
          <p className="mt-6 text-[13px] text-muted">Sin asistencias en el período.</p>
        ) : (
          <>
            <div className="mt-3 flex h-[136px] items-end gap-px border-b border-line sm:gap-[3px]">
              {items.map((it, k) => {
                const h = (it.value / max) * 100;
                const dim = hi !== null && hi !== k;
                const lit = hi === k || (hi === null && k === peak);
                return (
                  <div
                    key={k}
                    onMouseEnter={() => setHi(k)}
                    onMouseLeave={() => setHi(null)}
                    className="flex h-full flex-1 cursor-default flex-col items-center justify-end gap-1"
                  >
                    <span
                      className={cn(
                        'num text-[10px] font-bold tabular-nums transition-colors',
                        it.value === 0 ? 'opacity-0' : hi === k ? 'text-ink' : 'text-faint',
                      )}
                    >
                      {numero(it.value)}
                    </span>
                    <i
                      className="w-full rounded-t-[2px] transition-all duration-150"
                      data-bar="h"
                      data-val={h}
                      style={{
                        height: `${h}%`,
                        minHeight: it.value > 0 ? 4 : 0,
                        background: lit ? 'var(--color-brand)' : 'var(--color-brand-accent)',
                        opacity: dim ? 0.35 : 1,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            {/* Eje: con muchos días (p.ej. 30) las etiquetas no caben a 820 px y
                desbordaban la página. Cada celda es flex-1 + min-w-0 (nunca más ancha
                que su columna) y, cuando hay más de 12, solo se rotula 1 de cada
                `labelStep` (la resaltada siempre). */}
            <div className="mt-1.5 flex gap-px sm:gap-[3px]">
              {items.map((it, k) => {
                const show = hi === k || k % labelStep === 0;
                return (
                  <span
                    key={k}
                    className={cn(
                      'num min-w-0 flex-1 overflow-hidden text-center text-[10px] tabular-nums transition-colors',
                      hi === k ? 'font-bold text-ink' : 'text-faint',
                    )}
                  >
                    {/* Un <span> sin rol no admite aria-label (axe aria-prohibited-attr):
                        la etiqueta omitida queda como texto solo para lectores de pantalla. */}
                    {show ? it.label : <span className="sr-only">{it.label}</span>}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
