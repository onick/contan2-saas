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
  it('xl: columna con estado vacío; al elegir una fila muestra el lector en la región', () => {
    stubViewport(true);
    render(<LectoresClient initial={initial} initialStats={null} />);
    const region = screen.getByRole('region', { name: 'Detalles del lector' });
    expect(within(region).getByText(/Selecciona una fila/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalles de Ana Pérez' })[0]!);
    expect(within(region).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(region).getByText('CCB-AAA111')).toBeInTheDocument();
    expect(within(region).getByRole('tab', { name: 'Préstamos' })).toBeInTheDocument();
    fireEvent.click(within(region).getByRole('button', { name: 'Cerrar detalles' }));
    expect(within(region).getByText(/Selecciona una fila/)).toBeInTheDocument();
  });

  it('< xl: panel lateral como diálogo', () => {
    stubViewport(false);
    render(<LectoresClient initial={initial} initialStats={null} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalles de Ana Pérez' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'Detalles del lector' });
    expect(within(dialog).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Editar perfil de lector/ })).toBeInTheDocument();
  });
});
