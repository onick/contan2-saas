import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { PuertaIdentify } from './PuertaIdentify';

vi.mock('../checkin/CheckinScanModal', () => ({ CheckinScanModal: () => null }));

const item = (code: string, firstName: string) => ({ id: code, code, firstName, lastName: 'Pérez', email: null, protocol: false, invitedTo: [], visitCount: 2 });
const search = vi.fn();
vi.mock('../../lib/api/checkin-client', () => ({ searchCheckinVisitors: (...a: unknown[]) => search(...a) }));

beforeEach(() => { search.mockReset(); });
afterEach(() => cleanup());

function setup() {
  const onRegister = vi.fn();
  render(<PuertaIdentify onRegister={onRegister} busy={false} companions={0} onCompanions={() => {}} />);
  return onRegister;
}
const typeCode = (v: string) => {
  fireEvent.change(screen.getByPlaceholderText(/tipear el código/), { target: { value: v } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
};

describe('PuertaIdentify · código exacto (PUE-A07)', () => {
  it('código completo que no coincide → "No encontramos ese código" y NO selecciona al primer resultado', async () => {
    search.mockResolvedValue({ ok: true, data: { items: [item('CCB-AAAAAA', 'Ana'), item('CCB-BBBBBB', 'Beto')] } });
    setup();
    typeCode('ccb-zzzzzz');
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos ese código');
    expect(screen.queryByText(/Registrar entrada/)).not.toBeInTheDocument();
  });

  it('código exacto (sin importar mayúsculas) → selecciona a esa persona', async () => {
    search.mockResolvedValue({ ok: true, data: { items: [item('CCB-AAAAAA', 'Ana'), item('CCB-BBBBBB', 'Beto')] } });
    const onRegister = setup();
    typeCode('ccb-bbbbbb');
    fireEvent.click(await screen.findByRole('button', { name: /Registrar entrada/ }));
    expect(onRegister).toHaveBeenCalledWith('CCB-BBBBBB');
  });

  it('texto parcial → lista de sugerencias para elegir; no selecciona nada solo', async () => {
    search.mockResolvedValue({ ok: true, data: { items: [item('CCB-AAAAAA', 'Ana'), item('CCB-BBBBBB', 'Beto')] } });
    const onRegister = setup();
    typeCode('CCB-');
    expect(await screen.findByText('Beto Pérez')).toBeInTheDocument();
    expect(screen.getByText(/Elige a la persona/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar entrada/ })).not.toBeInTheDocument();
    expect(onRegister).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Beto Pérez'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Registrar entrada/ })).toBeInTheDocument());
  });

  it('parcial sin coincidencias → "No encontramos ese código"', async () => {
    search.mockResolvedValue({ ok: true, data: { items: [] } });
    setup();
    typeCode('CCB-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos ese código');
  });

  it('los controles de la búsqueda miden 44 px', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Buscar' }).className).toMatch(/md:min-h-11/);
    expect(screen.getByRole('button', { name: /Escanear/ }).className).toMatch(/md:min-h-11/);
  });
});
