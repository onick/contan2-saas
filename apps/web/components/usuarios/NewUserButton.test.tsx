import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

import { NewUserButton } from './NewUserButton';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const created = { user: { id: 'u1', code: 'CCB-7K2P9Q', firstName: 'Eva', lastName: 'Torres', email: 'eva@ccb.do', phone: null }, credential: 'dry-run' };

function openDrawer() {
  render(<NewUserButton />);
  fireEvent.click(screen.getByRole('button', { name: /Nuevo usuario/i }));
}

describe('NewUserButton', () => {
  it('crea visitante → POST con el payload y muestra el código real', async () => {
    const fetchMock = vi.fn().mockResolvedValue(J(201, created));
    vi.stubGlobal('fetch', fetchMock);
    openDrawer();
    fireEvent.change(screen.getByLabelText(/^Nombre$/i), { target: { value: 'Eva' } });
    fireEvent.change(screen.getByLabelText(/^Apellido$/i), { target: { value: 'Torres' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'eva@ccb.do' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear visitante/i }));
    await waitFor(() => expect(screen.getByText('CCB-7K2P9Q')).toBeInTheDocument());
    expect(screen.getByText(/Visitante creado/i)).toBeInTheDocument();
    const call = fetchMock.mock.calls[0]!;
    expect(String(call[0])).toBe('/app/usuarios/api');
    expect(JSON.parse((call[1] as { body: string }).body)).toEqual({ firstName: 'Eva', lastName: 'Torres', email: 'eva@ccb.do' });
  });

  it('valida nombre/apellido obligatorios sin pegar a la red', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    openDrawer();
    fireEvent.click(screen.getByRole('button', { name: /Crear visitante/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/obligatorios/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('409 email duplicado → error visible y conserva los datos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(409, { error: 'Ese correo ya está registrado en la organización.' })));
    openDrawer();
    fireEvent.change(screen.getByLabelText(/^Nombre$/i), { target: { value: 'Eva' } });
    fireEvent.change(screen.getByLabelText(/^Apellido$/i), { target: { value: 'Torres' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'dup@ccb.do' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear visitante/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/ya está registrado/i));
    expect(screen.getByDisplayValue('Eva')).toBeInTheDocument(); // datos conservados
  });
});
