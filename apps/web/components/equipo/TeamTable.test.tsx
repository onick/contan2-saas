import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { TeamTable } from './TeamTable';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const list = {
  items: [
    { id: 's1', fullName: 'Ana Owner', email: 'ana@ccb.do', role: 'owner', status: 'active', lastLoginAt: '2026-06-01T10:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 's2', fullName: 'Beto Admin', email: 'beto@ccb.do', role: 'admin', status: 'suspended', lastLoginAt: null, createdAt: '2026-02-01T00:00:00.000Z' },
  ],
  nextCursor: null,
};

describe('TeamTable', () => {
  it('carga y muestra miembros con rol/estado y último acceso (— si falta)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, list)));
    render(<TeamTable />);
    await waitFor(() => expect(screen.getByText('Ana Owner')).toBeInTheDocument());
    expect(screen.getByText('ana@ccb.do')).toBeInTheDocument();
    expect(screen.getByText('Beto Admin')).toBeInTheDocument();
    expect(screen.getByText('beto@ccb.do')).toBeInTheDocument();
    // 'Propietario'/'Suspendido' aparecen también en los <select>; basta con que la fila los muestre
    expect(screen.getAllByText('Propietario').length).toBeGreaterThan(1); // opción + chip
    expect(screen.getAllByText('Suspendido').length).toBeGreaterThan(1);
  });

  it('403 → mensaje honesto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(403, { error: 'no' })));
    render(<TeamTable />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/No tenés permiso/i));
  });

  it('vacío → estado honesto (sin demo)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, { items: [], nextCursor: null })));
    render(<TeamTable />);
    await waitFor(() => expect(screen.getByText(/No hay miembros/i)).toBeInTheDocument());
  });
});
