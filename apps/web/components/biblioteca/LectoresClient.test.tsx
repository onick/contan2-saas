import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import type { BiblioReader } from '@contan2/contracts';
import { LectoresClient } from './LectoresClient';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const reader: BiblioReader = {
  userId: 'u1', code: 'CCB-AAA111', firstName: 'Ana', lastName: 'Pérez', email: 'ana@ccb.do', phone: null,
  visitCount: 3, registeredAt: '2024-01-15T00:00:00.000Z', archived: false, readerType: 'no_empleado',
  employeeCode: null, document: null, notes: null, suspendedAt: null, suspendedReason: null,
};
const initial = { readers: [reader], total: 1, page: 1, pageSize: 20 };

function stubViewport(xl: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('min-width') ? xl : false, media: q,
    addEventListener: () => {}, removeEventListener: () => {},
  }));
}

describe('LectoresClient · panel de detalles (DetailPanel)', () => {
  it('xl: la columna está plegada sin selección; al elegir una fila se abre, resalta la fila y cierra de nuevo', () => {
    stubViewport(true);
    const { container } = render(<LectoresClient initial={initial} initialStats={null} />);
    const aside = container.querySelector('aside[data-detail-panel]')!;
    expect(aside).toHaveAttribute('data-detail-state', 'closed');
    expect(screen.queryByText(/Selecciona una fila/)).toBeNull();
    expect(container.querySelector('tr[aria-current="true"]')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalles de Ana Pérez' })[0]!);
    expect(aside).toHaveAttribute('data-detail-state', 'open');
    const region = screen.getByRole('region', { name: 'Detalles del lector' });
    expect(within(region).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(region).getByText('CCB-AAA111')).toBeInTheDocument();
    expect(within(region).getByRole('tab', { name: 'Préstamos' })).toBeInTheDocument();
    const current = container.querySelector('tr[aria-current="true"]')!;
    expect(current).toHaveTextContent('Ana Pérez');
    expect(current.className).toContain('bg-brand-soft/60');
    fireEvent.click(within(region).getByRole('button', { name: 'Cerrar detalles' }));
    expect(aside).toHaveAttribute('data-detail-state', 'closed');
    expect(container.querySelector('tr[aria-current="true"]')).toBeNull();
  });

  it('< xl: hoja inferior como diálogo', () => {
    stubViewport(false);
    render(<LectoresClient initial={initial} initialStats={null} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalles de Ana Pérez' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'Detalles del lector' });
    expect(within(dialog).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Editar perfil de lector/ })).toBeInTheDocument();
  });
});
