// components/usuarios/ImportButton.test.tsx · el drawer de importación: abre,
// muestra plantillas; al elegir archivo hace preview (sin commit) y muestra la
// tabla con estados y conteos; "Importar N nuevos" hace commit; "solo
// duplicados" deshabilita el botón.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ImportButton } from './ImportButton';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as Response;

const preview = (over: Partial<{ new: number; duplicates: number; invalid: number; nameWarnings: number }> = {}, rows: unknown[] = []) => ({
  mode: 'preview',
  rows,
  summary: { total: 3, new: 2, duplicates: 1, invalid: 0, nameWarnings: 0, ...over },
  truncated: false,
});

const ROWS = [
  { rowNum: 1, firstName: 'Carlos', lastName: 'Nuevo', email: 'c@x.do', phone: null, status: 'new' },
  { rowNum: 2, firstName: 'Ana', lastName: 'X', email: 'ana@x.do', phone: null, status: 'duplicate', reason: 'Ya existe un visitante con ese correo.' },
  { rowNum: 3, firstName: 'Beto', lastName: 'Dobles', email: 'b@x.do', phone: null, status: 'new', nameWarning: true },
];

function pickFile() {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  const file = new File(['Nombre,Apellido,Email\nA,B,c@x.do'], 'visitantes.csv', { type: 'text/csv' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('ImportButton', () => {
  it('abre el drawer con plantillas y zona de archivo', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<ImportButton />);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    expect(screen.getByRole('dialog', { name: 'Importar visitantes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Plantilla Excel/ })).toHaveAttribute('href', '/app/usuarios/api/import/template?format=xlsx');
    expect(screen.getByText(/no se modifican/)).toBeInTheDocument();
  });

  it('elegir archivo → preview (commit=false) con tabla, conteos y aviso de doble', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(preview({}, ROWS)));
    vi.stubGlobal('fetch', fetchMock);
    render(<ImportButton />);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    pickFile();

    await waitFor(() => expect(screen.getByText('2 nuevos')).toBeInTheDocument());
    expect(screen.getByText('1 duplicados')).toBeInTheDocument();
    expect(screen.getByText('Carlos Nuevo')).toBeInTheDocument();
    expect(screen.getByText('Ya existe')).toBeInTheDocument();
    expect(screen.getByText('posible doble')).toBeInTheDocument();
    // la primera llamada fue preview (commit=false)
    expect(fetchMock.mock.calls[0]![0]).toBe('/app/usuarios/api/import?commit=false');
    // botón refleja el nº de nuevos
    expect(screen.getByRole('button', { name: /Importar 2 nuevos/ })).toBeEnabled();
  });

  it('confirmar → commit=true; muestra resultado y recuerda credenciales', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(preview({}, ROWS)))
      .mockResolvedValueOnce(json({ mode: 'commit', result: { created: 2, skipped: 0, failed: 0 }, summary: preview().summary }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ImportButton />);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    pickFile();
    await waitFor(() => screen.getByRole('button', { name: /Importar 2 nuevos/ }));
    fireEvent.click(screen.getByRole('button', { name: /Importar 2 nuevos/ }));

    await waitFor(() => expect(screen.getByText('Se crearon 2 visitantes')).toBeInTheDocument());
    expect(screen.getByText(/Enviar credenciales pendientes/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]![0]).toBe('/app/usuarios/api/import?commit=true');
  });

  it('preview sin nuevos → botón Importar deshabilitado + mensaje', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(preview({ new: 0, duplicates: 3 }, []))));
    render(<ImportButton />);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    pickFile();
    await waitFor(() => expect(screen.getByText(/No hay visitantes nuevos/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Importar 0 nuevos/ })).toBeDisabled();
  });

  it('error del server en preview → mensaje honesto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ error: 'No reconocimos las columnas.' }, false)));
    render(<ImportButton />);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    pickFile();
    await waitFor(() => expect(screen.getByText('No reconocimos las columnas.')).toBeInTheDocument());
  });
});
