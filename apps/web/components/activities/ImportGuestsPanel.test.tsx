// components/activities/ImportGuestsPanel.test.tsx · el drawer de importar
// invitados: preview (commit=false) con estados por invitado y conteos;
// "Invitar N personas" hace commit=true y muestra el resultado.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ImportGuestsPanel } from './ImportGuestsPanel';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

const ROWS = [
  { rowNum: 1, firstName: 'Nuevo', lastName: 'Invitado', email: 'n@x.do', phone: null, status: 'new-invite' },
  { rowNum: 2, firstName: 'Existe', lastName: 'YaEnPadron', email: 'e@x.do', phone: null, status: 'existing-invite' },
  { rowNum: 3, firstName: 'Sin', lastName: 'Mail', email: null, phone: '809', status: 'new-invite', nameWarning: true },
  { rowNum: 4, firstName: 'Ya', lastName: 'Invitado', email: 'y@x.do', phone: null, status: 'already-invited', reason: 'Ya está en la lista de esta actividad.' },
];
const preview = (over = {}) => ({
  mode: 'preview', rows: ROWS, truncated: false,
  summary: { total: 4, toInvite: 3, newUsers: 2, existing: 1, alreadyInvited: 1, invalid: 0, noEmail: 1, nameWarnings: 1, ...over },
});

function pickFile() {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  const file = new File(['Nombre,Apellido,Email\nA,B,n@x.do'], 'invitados.csv', { type: 'text/csv' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

const noop = () => {};

describe('ImportGuestsPanel', () => {
  it('open=true muestra plantillas; explica que sin email entran igual', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<ImportGuestsPanel activityId="a1" activityName="Gala" open onClose={noop} onImported={noop} />);
    expect(screen.getByRole('dialog', { name: /Importar lista de invitados a Gala/ })).toBeInTheDocument();
    expect(screen.getByText(/no tengan correo entran igual/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Plantilla Excel/ })).toHaveAttribute('href', '/app/usuarios/api/import/template?format=xlsx');
  });

  it('elegir archivo → preview (commit=false) con estados, conteos y aviso doble', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(preview()));
    vi.stubGlobal('fetch', fetchMock);
    render(<ImportGuestsPanel activityId="a1" activityName="Gala" open onClose={noop} onImported={noop} />);
    pickFile();
    await waitFor(() => expect(screen.getByText('3 se invitan')).toBeInTheDocument());
    expect(screen.getByText('1 sin email')).toBeInTheDocument();
    expect(screen.getByText('1 ya en la lista')).toBeInTheDocument();
    expect(screen.getByText('Ya en la lista')).toBeInTheDocument();
    expect(screen.getByText('posible doble')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]![0]).toBe('/app/actividades/api/a1/import-guests?commit=false');
    expect(screen.getByRole('button', { name: /Invitar 3 personas/ })).toBeEnabled();
  });

  it('confirmar → commit=true; muestra el resultado y llama onImported', async () => {
    const onImported = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(preview()))
      .mockResolvedValueOnce(json({ mode: 'commit', result: { invited: 3, createdUsers: 2, alreadyInvited: 1, failed: 0 }, summary: preview().summary }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ImportGuestsPanel activityId="a1" activityName="Gala" open onClose={noop} onImported={onImported} />);
    pickFile();
    await waitFor(() => screen.getByRole('button', { name: /Invitar 3 personas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Invitar 3 personas/ }));
    await waitFor(() => expect(screen.getByText('3 invitados agregados a la lista')).toBeInTheDocument());
    expect(screen.getByText(/2 nuevos en el padrón/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]![0]).toBe('/app/actividades/api/a1/import-guests?commit=true');
    expect(onImported).toHaveBeenCalled();
  });

  it('preview sin nadie para invitar → botón deshabilitado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(preview({ toInvite: 0, newUsers: 0, existing: 0, alreadyInvited: 4 }))));
    render(<ImportGuestsPanel activityId="a1" activityName="Gala" open onClose={noop} onImported={noop} />);
    pickFile();
    await waitFor(() => expect(screen.getByText(/No hay nadie para invitar/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Invitar 0 personas/ })).toBeDisabled();
  });
});
