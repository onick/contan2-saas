import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TeamRowActions } from './TeamRowActions';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const operator = { id: 's2', fullName: 'Caro Operator', role: 'operator', status: 'active' };

describe('TeamRowActions', () => {
  it('admin sobre operator: cambia rol con confirmación (PATCH /role) y recarga', async () => {
    const fetchMock = vi.fn().mockResolvedValue(J(200, { id: 's2', role: 'admin' }));
    vi.stubGlobal('fetch', fetchMock);
    const onChanged = vi.fn();
    render(<TeamRowActions member={operator} currentStaffId="s1" currentRole="admin" onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /Acciones de Caro/i }));
    fireEvent.click(screen.getByText('Hacer Administrador'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0]!;
    const init = call[1] as { method: string; body: string };
    expect(String(call[0])).toBe('/app/equipo/api/s2/role');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ role: 'admin' });
  });

  it('admin no ve la opción "Hacer Propietario" (solo owner asigna owner)', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<TeamRowActions member={operator} currentStaffId="s1" currentRole="admin" onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Acciones/i }));
    expect(screen.getByText('Hacer Administrador')).toBeInTheDocument();
    expect(screen.queryByText('Hacer Propietario')).toBeNull();
    expect(screen.getByText('Suspender')).toBeInTheDocument();
  });

  it('error de la API se muestra (p. ej. último owner)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(400, { error: 'No podés suspender al último propietario activo.' })));
    render(<TeamRowActions member={operator} currentStaffId="s1" currentRole="admin" onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Acciones/i }));
    fireEvent.click(screen.getByText('Suspender'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/último propietario/i));
  });

  it('no renderiza acciones sobre uno mismo', () => {
    const { container } = render(<TeamRowActions member={{ ...operator, id: 's1' }} currentStaffId="s1" currentRole="admin" onChanged={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('admin no puede gestionar a un owner (sin menú)', () => {
    const { container } = render(<TeamRowActions member={{ ...operator, role: 'owner' }} currentStaffId="s1" currentRole="admin" onChanged={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
