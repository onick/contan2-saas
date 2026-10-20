'use client';

import { useRef, useState } from 'react';
import { Card } from '../ui';
import { cn } from '../ui/cn';
import { useDataAnim } from '../charts/useDataAnim';
import { numero } from '../../lib/format';

// Eje Y con ticks "redondos" (0/25/50/75…): ~3 intervalos, paso entero ≥1, techo = múltiplo del paso.
export function niceAxis(max: number): { top: number; ticks: number[] } {
  const raw = Math.max(1, max) / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const mult = [1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10;
  const step = Math.max(1, Math.round(mult * pow));
  const top = step * Math.ceil(Math.max(1, max) / step);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

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
  const axis = niceAxis(max);
  // Con muchas barras el valor sobre cada una se pisa en móvil: solo se rotula la barra
  // máxima (y la que se señala); desde sm (≥640 px) caben todas.
  const crowded = items.length > 14;

  return (
    <Card padding="lg" className="min-w-0">
      <div ref={rootRef}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[17px] font-semibold tracking-tight text-ink">Asistencias</h3>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 flex-none rounded-full"
              style={{ background: 'var(--chart-2)' }}
            />
            Asistencias
          </span>
        </div>

        {empty ? (
          <p className="mt-6 text-[13px] text-muted">Sin asistencias en el período.</p>
        ) : (
          <>
            <div className="mt-4 flex gap-2">
              <div aria-hidden="true" className="relative h-[200px] w-7 flex-none">
                {axis.ticks.map((t) => (
                  <span
                    key={t}
                    data-tick={t}
                    className="num absolute right-0 translate-y-1/2 text-[11px] tabular-nums text-faint"
                    style={{ bottom: `${(t / axis.top) * 100}%` }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="relative h-[200px] border-b border-line">
                  {axis.ticks.filter((t) => t > 0).map((t) => (
                    <i
                      key={t}
                      aria-hidden="true"
                      className="absolute inset-x-0 border-t border-line"
                      style={{ bottom: `${(t / axis.top) * 100}%` }}
                    />
                  ))}
                  <div className="absolute inset-0 flex items-end gap-px sm:gap-[3px]">
                    {items.map((it, k) => {
                      const h = (it.value / axis.top) * 100;
                      const dim = hi !== null && hi !== k;
                      const lit = hi === k || (hi === null && k === peak);
                      const labelVisible = !crowded || k === peak || hi === k;
                      return (
                        <div
                          key={k}
                          onMouseEnter={() => setHi(k)}
                          onMouseLeave={() => setHi(null)}
                          className="flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end gap-1"
                        >
                          <span
                            className={cn(
                              'num text-[10px] font-bold tabular-nums transition-colors',
                              it.value === 0 ? 'opacity-0' : hi === k || k === peak ? 'text-ink' : 'text-faint',
                              !labelVisible && 'max-sm:hidden',
                            )}
                          >
                            {numero(it.value)}
                          </span>
                          <i
                            className="w-full rounded-t-[3px] transition-all duration-150"
                            data-bar="h"
                            data-val={h}
                            data-peak={k === peak ? 'true' : undefined}
                            style={{
                              height: `${h}%`,
                              minHeight: it.value > 0 ? 4 : 0,
                              background: lit ? 'var(--chart-1)' : 'var(--chart-2)',
                              opacity: dim ? 0.35 : 1,
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Eje: con muchos días (p.ej. 30) las etiquetas no caben a 820 px y
                    desbordaban la página. Cada celda es flex-1 + min-w-0 (nunca más ancha
                    que su columna) y, cuando hay más de 12, solo se rotula 1 de cada
                    `labelStep` (la resaltada siempre). */}
                <div className="mt-1.5 flex h-4 gap-px sm:gap-[3px]">
                  {items.map((it, k) => {
                    const show = hi === k || k % labelStep === 0;
                    // Con 30 días cada celda mide ~20 px y «21/09» no cabe: la etiqueta se
                    // centra en absoluto sobre su columna y desborda hacia las vecinas, que
                    // quedan vacías por `labelStep`. En móvil se oculta 1 de cada 2 rotuladas
                    // (nunca la resaltada) para que no se pisen.
                    const thin = show && hi !== k && Math.floor(k / labelStep) % 2 === 1;
                    return (
                      <span key={k} className="relative min-w-0 flex-1">
                        {/* Un <span> sin rol no admite aria-label (axe aria-prohibited-attr):
                            la etiqueta omitida queda como texto solo para lectores de pantalla. */}
                        {show ? (
                          <span
                            className={cn(
                              'num absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums transition-colors',
                              hi === k ? 'font-bold text-ink' : 'text-faint',
                              thin && 'max-sm:sr-only',
                            )}
                          >
                            {it.label}
                          </span>
                        ) : (
                          <span className="sr-only">{it.label}</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
