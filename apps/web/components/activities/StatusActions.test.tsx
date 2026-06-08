import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { StatusActions } from './StatusActions';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mockFetch(status: number, body?: unknown) {
  const payload = body === undefined ? '{}' : JSON.stringify(body);
  const fn = vi.fn().mockResolvedValue(new Response(payload, { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}
const renderA = (statusRaw: 'activa' | 'finalizada' | 'cancelada') => {
  const onChanged = vi.fn();
  render(<StatusActions id="A1" statusRaw={statusRaw} onChanged={onChanged} />);
  return { onChanged };
};

describe('StatusActions · matriz de transiciones', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });

  it('activa → ofrece Finalizar y Cancelar (no Reactivar)', () => {
    renderA('activa');
    expect(screen.getByRole('button', { name: 'Finalizar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull();
  });

  it('finalizada → sólo Reactivar', () => {
    renderA('finalizada');
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finalizar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });

  it('cancelada → sólo Reactivar', () => {
    renderA('cancelada');
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
  });

  it('Finalizar: confirma y hace PATCH { status: finalizada } → onChanged', async () => {
    const fetchFn = mockFetch(200, { activity: {} });
    const { onChanged } = renderA('activa');
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sí, finalizar|Aplicando/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/app/actividades/api/A1/status');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ status: 'finalizada' });
  });

  it('Cancelar: el diálogo aclara que no se envían correos', () => {
    renderA('activa');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/no se envían correos/i);
  });

  it('Reactivar: PATCH { status: activa } desde finalizada', async () => {
    const fetchFn = mockFetch(200);
    const { onChanged } = renderA('finalizada');
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }));
    fireEvent.click(screen.getByRole('button', { name: /Sí, reactivar|Aplicando/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(JSON.parse(fetchFn.mock.calls[0]![1].body)).toEqual({ status: 'activa' });
  });

  it('409 transición no permitida → mensaje, sin onChanged', async () => {
    mockFetch(409, { error: 'No se puede pasar de finalizada a cancelada.' });
    const { onChanged } = renderA('activa');
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    fireEvent.click(screen.getByRole('button', { name: /Sí, finalizar|Aplicando/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no se puede pasar/i));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('403 → mensaje de permiso', async () => {
    mockFetch(403, { error: 'x' });
    const { onChanged } = renderA('activa');
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    fireEvent.click(screen.getByRole('button', { name: /Sí, finalizar|Aplicando/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/permiso/i));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('"No, volver" cierra el diálogo sin PATCH', () => {
    const fetchFn = mockFetch(200);
    renderA('activa');
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    fireEvent.click(screen.getByRole('button', { name: 'No, volver' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
