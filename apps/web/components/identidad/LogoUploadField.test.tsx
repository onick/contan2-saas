import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { LogoUploadField } from './LogoUploadField';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const png = (name = 'logo.png') => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' });

// jsdom no implementa el parse real de multipart; basta con verificar la URL/método.
function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('LogoUploadField', () => {
  it('sube el archivo y devuelve la ruta al onChange', async () => {
    const fetchMock = vi.fn().mockResolvedValue(J(201, { logoUrl: '/uploads/v2-logo-abc.png' }));
    vi.stubGlobal('fetch', fetchMock);
    const onChange = vi.fn();
    render(<LogoUploadField value={null} onChange={onChange} />);
    fireEvent.change(fileInput(), { target: { files: [png()] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/uploads/v2-logo-abc.png'));
    expect(fetchMock.mock.calls[0]![0]).toBe('/app/identidad/api/logo');
    expect(fetchMock.mock.calls[0]![1].method).toBe('POST');
  });

  it('rechaza formatos no permitidos sin llamar a la API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<LogoUploadField value={null} onChange={vi.fn()} />);
    const pdf = new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput(), { target: { files: [pdf] } });
    await waitFor(() => expect(screen.getByText(/Formato no permitido/i)).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('muestra el error que devuelve la API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(413, { error: 'El logo supera el máximo de 2 MB.' })));
    render(<LogoUploadField value={null} onChange={vi.fn()} />);
    fireEvent.change(fileInput(), { target: { files: [png()] } });
    await waitFor(() => expect(screen.getByText(/supera el máximo de 2 MB/i)).toBeInTheDocument());
  });

  it('con valor muestra preview dual (Credencial + Sidebar) y permite quitar', () => {
    const onChange = vi.fn();
    render(<LogoUploadField value="/uploads/v2-logo-abc.png" onChange={onChange} />);
    expect(screen.getByText('Credencial')).toBeInTheDocument();
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Quitar/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('opción avanzada: pegar una URL setea el valor', () => {
    const onChange = vi.fn();
    render(<LogoUploadField value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /¿Tu logo está en una URL/i }));
    fireEvent.change(screen.getByPlaceholderText(/https:/i), { target: { value: 'https://cdn.x/logo.png' } });
    expect(onChange).toHaveBeenCalledWith('https://cdn.x/logo.png');
  });

  it('deshabilitado no dispara subida', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<LogoUploadField value={null} onChange={vi.fn()} disabled />);
    fireEvent.change(fileInput(), { target: { files: [png()] } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
