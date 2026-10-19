import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { YearRegisterDownload } from './YearRegisterDownload';

afterEach(cleanup);

describe('YearRegisterDownload', () => {
  it('el botón apunta al BFF del libro anual con el año elegido', () => {
    render(<YearRegisterDownload />);
    const link = screen.getByRole('link', { name: /Descargar libro anual/ });
    expect(link.getAttribute('href')).toMatch(/^\/app\/reportes\/api\/year\?year=\d{4}$/);
    const select = screen.getByLabelText('Año') as HTMLSelectElement;
    const other = Array.from(select.options).map((o) => o.value).find((v) => v !== select.value)!;
    fireEvent.change(select, { target: { value: other } });
    expect(screen.getByRole('link', { name: /Descargar libro anual/ }).getAttribute('href')).toBe(`/app/reportes/api/year?year=${other}`);
  });
});
