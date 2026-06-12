// components/protocolo/ProtocolDirectory.test.tsx · directorio de protocolo:
// estados honestos (403/vacío), listado con categoría y honorífico, y el
// drawer de designar con autocomplete de visitantes.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { ProtocolDirectory } from './ProtocolDirectory';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const profile = {
  userId: 'u1', code: 'CCB-ABC123', firstName: 'Juan', lastName: 'Pérez',
  email: 'emb@madrid.es', phone: null, category: 'diplomatico',
  honorific: 'Sr. Embajador', orgTitle: 'Embajada de España', notes: null,
  active: true, createdAt: '2026-06-11T12:00:00.000Z',
};

describe('ProtocolDirectory', () => {
  it('operator (403) → mensaje honesto de permisos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'no' }, 403)));
    render(<ProtocolDirectory />);
    await waitFor(() => expect(screen.getByText('Necesitás permisos de administración')).toBeInTheDocument());
  });

  it('vacío → empty state con invitación a designar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ profiles: [], counts: {} })));
    render(<ProtocolDirectory />);
    await waitFor(() => expect(screen.getByText('Aún no hay invitados de protocolo')).toBeInTheDocument());
  });

  it('lista designados con honorífico, código, categoría y conteos en pills', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ profiles: [profile], counts: { diplomatico: 1 } })));
    render(<ProtocolDirectory />);
    await waitFor(() => expect(screen.getByText(/Sr\. Embajador Juan Pérez/)).toBeInTheDocument());
    expect(screen.getByText('CCB-ABC123')).toBeInTheDocument();
    expect(screen.getByText('Embajada de España')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todas (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diplomático (1)' })).toBeInTheDocument();
  });

  it('"Designar invitado" abre el drawer; elegir visitante habilita Designar', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ profiles: [], counts: {} })) // load inicial
      .mockResolvedValue(json({ items: [{ id: 'u9', code: 'CCB-XYZ999', firstName: 'Ana', lastName: 'Gómez', email: null, visitCount: 3 }] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProtocolDirectory />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Designar invitado/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Designar invitado/ }));
    const designar = screen.getByRole('button', { name: 'Designar' });
    expect(designar).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Visitante'), { target: { value: 'Ana Gomez' } });
    await waitFor(() => expect(screen.getByText('Ana Gómez')).toBeInTheDocument(), { timeout: 2000 });
    fireEvent.click(screen.getByText('Ana Gómez'));
    expect(screen.getByText(/Ana Gómez · CCB-XYZ999/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Designar' })).toBeEnabled();
  });

  it('desactivar pide confirmación inline antes del DELETE', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ profiles: [profile], counts: { diplomatico: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProtocolDirectory />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Desactivar designación de Juan/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Desactivar designación de Juan/ }));
    expect(screen.getByRole('button', { name: '¿Desactivar?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(screen.queryByRole('button', { name: '¿Desactivar?' })).toBeNull();
    // ningún DELETE disparado
    expect(fetchMock.mock.calls.every((c) => (c[1] as RequestInit | undefined)?.method !== 'DELETE')).toBe(true);
  });
});
