import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CoverDropzone, validateCoverFile } from './CoverDropzone';

const createObjectURL = vi.fn(() => 'blob:preview');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  // jsdom no implementa estas APIs → las stubbeamos.
  (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
  (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const png = (size = 1024) => new File([new Uint8Array(size)], 'foto.png', { type: 'image/png' });
const fileInput = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;

describe('validateCoverFile', () => {
  it('acepta jpeg/png/webp ≤5MB; rechaza otros y >5MB', () => {
    expect(validateCoverFile(new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }))).toBeNull();
    expect(validateCoverFile(new File([new Uint8Array(10)], 'a.gif', { type: 'image/gif' }))).toMatch(/Formato/);
    expect(validateCoverFile(new File([new Uint8Array(6 * 1024 * 1024)], 'a.png', { type: 'image/png' }))).toMatch(/5 MB/);
  });
});

describe('CoverDropzone', () => {
  it('picker: elegir un archivo válido llama onSelect', () => {
    const onSelect = vi.fn();
    const { container } = render(<CoverDropzone file={null} onSelect={onSelect} />);
    fireEvent.change(fileInput(container), { target: { files: [png()] } });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toBeInstanceOf(File);
  });

  it('drag & drop: soltar un archivo válido llama onSelect', () => {
    const onSelect = vi.fn();
    const { container } = render(<CoverDropzone file={null} onSelect={onSelect} />);
    const zone = screen.getByRole('button');
    fireEvent.drop(zone, { dataTransfer: { files: [png()] } });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('tipo inválido: no selecciona y muestra error', () => {
    const onSelect = vi.fn();
    const { container } = render(<CoverDropzone file={null} onSelect={onSelect} />);
    fireEvent.change(fileInput(container), { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Formato no permitido/);
  });

  it('tamaño inválido (>5MB): no selecciona y muestra error', () => {
    const onSelect = vi.fn();
    const { container } = render(<CoverDropzone file={null} onSelect={onSelect} />);
    fireEvent.change(fileInput(container), { target: { files: [png(6 * 1024 * 1024)] } });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/5 MB/);
  });

  it('preview: crea object URL con file y lo revoca al desmontar', () => {
    const { unmount } = render(<CoverDropzone file={png()} onSelect={vi.fn()} />);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect((screen.getByAltText('Vista previa de la portada') as HTMLImageElement).getAttribute('src')).toBe('blob:preview');
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('revoca el object URL anterior al cambiar de file', () => {
    const { rerender } = render(<CoverDropzone file={png()} onSelect={vi.fn()} />);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    rerender(<CoverDropzone file={png(2048)} onSelect={vi.fn()} />);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview'); // revocó el anterior
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it('quitar: con file, el botón Quitar llama onSelect(null)', () => {
    const onSelect = vi.fn();
    render(<CoverDropzone file={png()} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Quitar/ }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
