// RegistrosChart · el eje de días no debe desbordar a 820 px: cada etiqueta es
// min-w-0 (no más ancha que su columna) y con más de 12 días solo se rotula
// 1 de cada labelStep (Q7 B4 / sweep "overflow horizontal en /app @820").
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RegistrosChart } from './RegistrosChart';

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
