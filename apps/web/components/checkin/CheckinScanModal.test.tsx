// components/checkin/CheckinScanModal.test.tsx · escáner de credencial (jsdom).
// jsdom no tiene navigator.mediaDevices → el visor cae al fallback de cámara y la
// entrada manual ejerce el MISMO camino que la cámara (normaliza → valida →
// onDetect). No se postea nada acá: el modal sólo resuelve el código.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CheckinScanModal } from './CheckinScanModal';

afterEach(cleanup);

function setup(open = true) {
  const onClose = vi.fn();
  const onDetect = vi.fn();
  render(<CheckinScanModal open={open} onClose={onClose} onDetect={onDetect} />);
  return { onClose, onDetect };
}

describe('CheckinScanModal', () => {
  it('cerrado no renderiza nada', () => {
    setup(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('abierto sin cámara muestra fallback + entrada manual', () => {
    setup();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Cámara no disponible/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Código de credencial manual')).toBeInTheDocument();
  });

  it('código manual válido normaliza y llama onDetect', () => {
    const { onDetect } = setup();
    fireEvent.change(screen.getByLabelText('Código de credencial manual'), { target: { value: 'ccb-ab12cd' } });
    fireEvent.click(screen.getByRole('button', { name: /Usar código/i }));
    expect(onDetect).toHaveBeenCalledWith('CCB-AB12CD');
  });

  it('código inválido NO llama onDetect y muestra aviso', () => {
    const { onDetect } = setup();
    fireEvent.change(screen.getByLabelText('Código de credencial manual'), { target: { value: 'hola' } });
    fireEvent.click(screen.getByRole('button', { name: /Usar código/i }));
    expect(onDetect).not.toHaveBeenCalled();
    expect(screen.getByText(/Código no válido/i)).toBeInTheDocument();
  });

  it('Escape cierra', () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
