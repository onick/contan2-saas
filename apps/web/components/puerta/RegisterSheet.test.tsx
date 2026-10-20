import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { RegisterSheet } from './RegisterSheet';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { window.localStorage.clear(); } catch { /* sin storage */ } });

const byId = { s1: { id: 's1', name: 'Ada Balcácer' } } as never;
const base = { reg: { salaIds: ['s1'] }, byId, busy: false, onClose: () => {}, notice: null };

describe('RegisterSheet (separado de PuertaBoard)', () => {
  it('es un diálogo con el nombre de la sala, tres pestañas de 44 px y "sin datos"', () => {
    render(<RegisterSheet {...base} onSubmit={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Ada Balcácer' })).toBeInTheDocument();
    for (const n of ['Nuevo visitante', 'Buscar / QR', 'Grupo']) expect(screen.getByRole('button', { name: n }).className).toMatch(/min-h-11/);
    expect(screen.getByRole('button', { name: 'Registrar sin datos (anónimo)' })).toBeInTheDocument();
  });

  it('"sin datos" manda un registro anónimo con los acompañantes en 0', () => {
    const onSubmit = vi.fn();
    render(<RegisterSheet {...base} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar sin datos (anónimo)' }));
    expect(onSubmit).toHaveBeenCalledWith({ salaIds: ['s1'], mode: 'anonymous', companions: 0 }, expect.any(Function));
  });

  it('cerrado (reg=null) no renderiza nada', () => {
    render(<RegisterSheet {...base} reg={null} onSubmit={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
