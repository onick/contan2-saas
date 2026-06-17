import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { BrandingEditor, type BrandingInitial } from './BrandingEditor';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const INITIAL: BrandingInitial = { name: 'CCB', logoUrl: null, credentialLogoUrl: null, primaryColor: '#e65100', secondaryColor: '#ff6f00', sidebarTheme: 'brand' };
const J = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('BrandingEditor', () => {
  it('guarda solo los campos cambiados (PATCH con el diff)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(J(200, { organization: { ...INITIAL, name: 'CCB Nuevo', status: 'active' } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<BrandingEditor initial={INITIAL} canEdit />);
    fireEvent.change(screen.getByDisplayValue('CCB'), { target: { value: 'CCB Nuevo' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
    await waitFor(() => expect(screen.getByText('Identidad guardada.')).toBeInTheDocument());
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toEqual({ name: 'CCB Nuevo' }); // solo el campo cambiado
  });

  it('#f39228 en primario → aviso de contraste (texto oscuro AA)', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<BrandingEditor initial={INITIAL} canEdit />);
    fireEvent.change(screen.getByLabelText('Color primario hex'), { target: { value: '#f39228' } });
    expect(screen.getByText(/No cumple AA → el preview usa texto OSCURO/i)).toBeInTheDocument();
  });

  it('hex inválido deshabilita guardar', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<BrandingEditor initial={INITIAL} canEdit />);
    fireEvent.change(screen.getByLabelText('Color primario hex'), { target: { value: 'rojo' } });
    expect(screen.getByText('Hex #RRGGBB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
  });

  it('error de la API se muestra', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(400, { error: 'Datos de identidad inválidos.' })));
    render(<BrandingEditor initial={INITIAL} canEdit />);
    fireEvent.change(screen.getByDisplayValue('CCB'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/inválidos/i));
  });

  it('operator (canEdit=false) → solo lectura, sin botón guardar', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<BrandingEditor initial={INITIAL} canEdit={false} />);
    expect(screen.getByText(/Solo el propietario o un administrador/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar cambios/i })).toBeNull();
  });
});
