// RegistrosChart · el eje de días no debe desbordar a 820 px: cada etiqueta es
// min-w-0 (no más ancha que su columna) y con más de 12 días solo se rotula
// 1 de cada labelStep (Q7 B4 / sweep "overflow horizontal en /app @820").
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RegistrosChart, niceAxis } from './RegistrosChart';

vi.mock('../charts/useDataAnim', () => ({ useDataAnim: () => undefined }));

afterEach(cleanup);

const days = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, value: (i % 5) + 1 }));

describe('RegistrosChart · eje de días', () => {
  it('con 30 días rotula a lo sumo 12 etiquetas y todas las celdas llevan min-w-0', () => {
    const { container } = render(<RegistrosChart series={days(30)} />);
    const cells = Array.from(container.querySelectorAll('span.num.flex-1'));
    expect(cells.length).toBe(30);
    for (const c of cells) expect(c.className).toContain('min-w-0');
    const visible = cells.filter((c) => !c.querySelector('.sr-only'));
    expect(visible.length).toBeLessThanOrEqual(12);
    expect(visible.length).toBeGreaterThan(0);
    // Las no rotuladas conservan el día como texto solo para lectores de pantalla
    // (nunca aria-label en un <span> sin rol: axe aria-prohibited-attr).
    const hidden = cells.filter((c) => c.querySelector('.sr-only'));
    expect(hidden.length).toBe(cells.length - visible.length);
    for (const c of cells) expect(c.getAttribute('aria-label')).toBeNull();
    expect(hidden[0]?.textContent).toMatch(/\d{2}\/\d{2}/);
  });

  it('con 7 días rotula todos', () => {
    const { container } = render(<RegistrosChart series={days(7)} />);
    const cells = Array.from(container.querySelectorAll('span.num.flex-1'));
    expect(cells.filter((c) => !c.querySelector('.sr-only')).length).toBe(7);
  });
});

describe('niceAxis', () => {
  it('72 → 0/25/50/75 (como el mockup)', () => {
    expect(niceAxis(72)).toEqual({ top: 75, ticks: [0, 25, 50, 75] });
  });
  it('valores chicos mantienen pasos enteros', () => {
    expect(niceAxis(1).ticks).toEqual([0, 1]);
    expect(niceAxis(9).top).toBeGreaterThanOrEqual(9);
  });
});

describe('RegistrosChart · piel del Inicio', () => {
  it('barras en el secundario (--chart-2), la máxima resaltada en marca (--chart-1)', () => {
    const { container } = render(<RegistrosChart series={days(7)} />);
    const bars = Array.from(container.querySelectorAll<HTMLElement>('i[data-bar="h"]'));
    const peaks = bars.filter((b) => b.dataset.peak === 'true');
    expect(peaks).toHaveLength(1);
    expect(peaks[0]!.style.background).toContain('--chart-1');
    expect(bars.filter((b) => b !== peaks[0]).every((b) => b.style.background.includes('--chart-2'))).toBe(true);
  });

  it('eje Y con ticks redondos y leyenda "Asistencias" a la derecha', () => {
    const { container } = render(<RegistrosChart series={days(7)} />);
    expect(Array.from(container.querySelectorAll('[data-tick]')).map((e) => e.textContent)).toEqual(['0', '2', '4', '6']);
    expect(container.querySelector('h3')!.textContent).toBe('Asistencias');
    expect(container.querySelector('span.rounded-full')!.parentElement!.textContent).toBe('Asistencias');
  });

  it('con muchas barras, el valor de las no-máximas se oculta en móvil (max-sm:hidden)', () => {
    const { container } = render(<RegistrosChart series={days(30)} />);
    const labels = Array.from(container.querySelectorAll('div.flex-col > span.num'));
    expect(labels.filter((l) => l.className.includes('max-sm:hidden')).length).toBe(29);
  });

  it('con pocas barras todos los valores se ven en móvil', () => {
    const { container } = render(<RegistrosChart series={days(7)} />);
    const labels = Array.from(container.querySelectorAll('div.flex-col > span.num'));
    expect(labels.some((l) => l.className.includes('max-sm:hidden'))).toBe(false);
  });
});
