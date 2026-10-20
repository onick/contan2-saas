import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { EntradasHoy } from './EntradasHoy';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const SALAS = [{ id: 's1', name: 'Ada Balcácer' }, { id: 's2', name: 'Sala VR' }];
const E1 = { id: 'e1', salaId: 's1', salaName: 'Ada Balcácer', at: '2030-01-15T15:30:00.000Z', mode: 'identified', name: 'Ana Gómez', code: 'CCB-AB12CD', groupKind: null, people: 3, registeredBy: 'Marta', canUndo: true };
const E2 = { id: 'e2', salaId: 's2', salaName: 'Sala VR', at: '2030-01-15T14:00:00.000Z', mode: 'group', name: 'Colegio San José', code: null, groupKind: null, people: 21, registeredBy: null, canUndo: false };
const page = (entries: unknown[], total = entries.length) => ({ date: '2030-01-15', entries, total, people: 24, limit: 50, offset: 0 });

function mockApi(opts: { entries?: unknown[]; total?: number; del?: Response } = {}) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') return opts.del ?? J(200, { ok: true, entryId: 'e1', partySize: 3 });
    return J(200, page(opts.entries ?? [E1, E2], opts.total));
  });
  vi.stubGlobal('fetch', f);
  return f;
}
const openVisit = async (name: RegExp) => {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog', { name: 'Detalle de la visita' });
};

describe('EntradasHoy · lista', () => {
  it('lista las entradas del día con hora (24 h), quién o grupo, personas y quién registró; sin correo ni teléfono', async () => {
    mockApi();
    render(<EntradasHoy salas={SALAS} />);
    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getByText('11:30')).toBeInTheDocument();      // 15:30Z = 11:30 en RD
    expect(screen.getByText('3 personas')).toBeInTheDocument();
    expect(screen.getByText(/Registró Marta/)).toBeInTheDocument();
    expect(screen.getByText('Colegio San José')).toBeInTheDocument();
    expect(screen.getByText('21 personas')).toBeInTheDocument();
    expect(screen.getByText(/Registro anterior/)).toBeInTheDocument();
    expect(screen.getByText(/2 registros · 24 personas/)).toBeInTheDocument();
  });

  it('filtra por sala con las pastillas (pide ?salaId=)', async () => {
    const f = mockApi();
    render(<EntradasHoy salas={SALAS} />);
    await screen.findByText('Ana Gómez');
    fireEvent.click(screen.getByRole('button', { name: 'Sala VR' }));
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('salaId=s2'))).toBe(true));
  });

  it('vacío → "Sin entradas hoy"; error → Reintentar; 403 → sin permiso', async () => {
    mockApi({ entries: [] });
    const a = render(<EntradasHoy salas={SALAS} />);
    expect(await screen.findByText('Sin entradas hoy')).toBeInTheDocument();
    a.unmount();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(500, {})));
    const b = render(<EntradasHoy salas={SALAS} />);
    expect(await screen.findByText('No pudimos cargar las entradas')).toBeInTheDocument();
    expect(screen.queryByText('Sin entradas hoy')).not.toBeInTheDocument();
    b.unmount();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(403, {})));
    render(<EntradasHoy salas={SALAS} />);
    expect(await screen.findByText('No tienes permiso para ver las entradas')).toBeInTheDocument();
  });

  it('"Ver más" pide la siguiente página con offset', async () => {
    const f = vi.fn(async (url: string) => (String(url).includes('offset=1') ? J(200, { ...page([E2], 2), offset: 1 }) : J(200, page([E1], 2))));
    vi.stubGlobal('fetch', f);
    render(<EntradasHoy salas={SALAS} />);
    fireEvent.click(await screen.findByRole('button', { name: /Ver más \(1\)/ }));
    expect(await screen.findByText('Colegio San José')).toBeInTheDocument();
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver más/ })).not.toBeInTheDocument();
  });

  it('los controles miden 44 px', async () => {
    mockApi();
    render(<EntradasHoy salas={SALAS} />);
    for (const n of ['Todas', 'Sala VR']) expect((await screen.findByRole('button', { name: n })).className).toMatch(/min-h-11/);
    expect(screen.getByRole('button', { name: /Ver visita de Ana Gómez/ }).className).toMatch(/min-h-11/);
  });
});

describe('EntradasHoy · detalle de la visita y Deshacer', () => {
  it('abre el detalle con sala, hora, código, personas y quién registró', async () => {
    mockApi();
    render(<EntradasHoy salas={SALAS} />);
    const dlg = await openVisit(/Ver visita de Ana Gómez/);
    expect(within(dlg).getByRole('heading', { name: 'Ana Gómez' })).toBeInTheDocument();
    expect(within(dlg).getByText('Identificado')).toBeInTheDocument();
    expect(within(dlg).getByText('CCB-AB12CD')).toBeInTheDocument();
    expect(within(dlg).getByText('Marta')).toBeInTheDocument();
    expect(within(dlg).getByText('3 personas')).toBeInTheDocument();
  });

  it('Deshacer pide confirmación, llama DELETE /entries/:id, avisa y refresca', async () => {
    const f = mockApi();
    const onChanged = vi.fn();
    render(<EntradasHoy salas={SALAS} onChanged={onChanged} />);
    const dlg = await openVisit(/Ver visita de Ana Gómez/);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Deshacer' }));
    expect(within(dlg).getByRole('group', { name: 'Confirmar Deshacer' })).toHaveTextContent('¿Deshacer esta entrada de 3 personas?');
    expect(f.mock.calls.some(([, i]) => i?.method === 'DELETE')).toBe(false);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Sí, deshacer' }));
    await waitFor(() => expect(f).toHaveBeenCalledWith('/app/puerta/api/entries/e1', expect.objectContaining({ method: 'DELETE' })));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Entrada deshecha'));
    expect(onChanged).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Detalle de la visita' })).not.toBeInTheDocument();
  });

  it('403 del servidor → muestra su motivo y no cierra el detalle', async () => {
    mockApi({ del: J(403, { error: 'Pasaron más de 10 minutos. Pídele a un administrador que la quite desde Registros.' }) });
    render(<EntradasHoy salas={SALAS} />);
    const dlg = await openVisit(/Ver visita de Ana Gómez/);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Deshacer' }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Sí, deshacer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pasaron más de 10 minutos');
    expect(screen.getByRole('dialog', { name: 'Detalle de la visita' })).toBeInTheDocument();
  });

  it('canUndo=false → Deshacer deshabilitado y explica por qué', async () => {
    mockApi();
    render(<EntradasHoy salas={SALAS} />);
    const dlg = await openVisit(/Ver visita de Colegio San José/);
    expect(within(dlg).getByRole('button', { name: 'Deshacer' })).toBeDisabled();
    expect(within(dlg).getByText(/No puedes deshacer esta entrada/)).toHaveTextContent('10 minutos');
    expect(within(dlg).getByText('Grupo')).toBeInTheDocument();
  });
});
