// components/usuarios/ExportButton.test.tsx · el menú de exportar arma los
// hrefs del BFF correctamente: "vista actual" arrastra cohorte/estado/búsqueda;
// "todo el padrón" sólo el estado (sin cohorte ni q).

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ExportButton } from './ExportButton';

afterEach(cleanup);

const hrefs = () => screen.getAllByRole('menuitem').map((a) => a.getAttribute('href') ?? '');

describe('ExportButton', () => {
  it('cerrado por defecto; abre al click', () => {
    render(<ExportButton cohort="all" status="active" q="" filteredTotal={100} />);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Exportar/ }));
    expect(screen.getByRole('menu', { name: 'Exportar visitantes' })).toBeInTheDocument();
  });

  it('con filtros: "vista actual" arrastra cohorte+estado+q; "todo" sólo estado', () => {
    render(<ExportButton cohort="frequent" status="all" q="ana perez" filteredTotal={12} />);
    fireEvent.click(screen.getByRole('button', { name: /Exportar/ }));
    const [vXlsx, vCsv, aXlsx, aCsv] = hrefs();
    // Vista actual (xlsx/csv): scope=view + filtros, q URL-encoded.
    expect(vXlsx).toContain('format=xlsx');
    expect(vXlsx).toContain('scope=view');
    expect(vXlsx).toContain('cohort=frequent');
    expect(vXlsx).toContain('status=all');
    expect(vXlsx).toContain('q=ana+perez');
    expect(vCsv).toContain('format=csv');
    // Todo el padrón: scope=all, sólo estado, SIN cohorte ni q.
    expect(aXlsx).toContain('scope=all');
    expect(aXlsx).toContain('status=all');
    expect(aXlsx).not.toContain('cohort=');
    expect(aXlsx).not.toContain('q=');
    expect(aCsv).toContain('format=csv');
    expect(aCsv).toContain('scope=all');
    // Muestra el total filtrado cuando hay filtro.
    expect(screen.getByText(/Vista actual · 12/)).toBeInTheDocument();
  });

  it('sin filtros: no incluye q; no muestra el conteo en la etiqueta', () => {
    render(<ExportButton cohort="all" status="active" q="" filteredTotal={1212} />);
    fireEvent.click(screen.getByRole('button', { name: /Exportar/ }));
    expect(hrefs()[0]).not.toContain('q=');
    expect(screen.getByText('Vista actual')).toBeInTheDocument();
  });
});
