import React, { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { NumberField, type NumberFieldProps } from './NumberField';

afterEach(cleanup);

function Harness(props: Partial<NumberFieldProps> & { start?: number }) {
  const [v, setV] = useState(props.start ?? 0);
  const { start: _s, ...rest } = props;
  return (
    <NumberField label="Niños" value={v} onValueChange={setV} decrementLabel="Quitar niños" incrementLabel="Agregar niños" {...rest} />
  );
}

describe('NumberField', () => {
  it('sube y baja con los botones y respeta los nombres accesibles', () => {
    render(<Harness editable={false} max={6} />);
    const spin = screen.getByRole('spinbutton', { name: 'Niños' });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar niños' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar niños' }));
    expect(spin).toHaveAttribute('aria-valuenow', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar niños' }));
    expect(spin).toHaveAttribute('aria-valuenow', '1');
  });

  it('expone aria-valuenow/min/max', () => {
    render(<Harness editable={false} min={1} max={6} start={3} />);
    const spin = screen.getByRole('spinbutton');
    expect(spin).toHaveAttribute('aria-valuenow', '3');
    expect(spin).toHaveAttribute('aria-valuemin', '1');
    expect(spin).toHaveAttribute('aria-valuemax', '6');
  });

  it('en el tope: aria-disabled (enfocable), "Máximo 6" y anuncio "6, máximo"', () => {
    const { container } = render(<Harness editable={false} max={6} start={5} />);
    const plus = screen.getByRole('button', { name: 'Agregar niños' });
    expect(plus).not.toHaveAttribute('aria-disabled');
    fireEvent.click(plus);
    expect(plus).toHaveAttribute('aria-disabled', 'true');
    expect(plus).not.toBeDisabled();
    expect(screen.getByText('Máximo 6')).toBeInTheDocument();
    // presionar contra el tope no cambia el valor y anuncia
    fireEvent.click(plus);
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '6');
    expect(container.querySelector('.arc-nf')).toHaveAttribute('data-strain', 'max');
    expect(screen.getByText('6, máximo')).toBeInTheDocument();
  });

  it('en el mínimo: Quitar con aria-disabled y anuncio "0, mínimo"', () => {
    render(<Harness editable={false} max={6} />);
    const minus = screen.getByRole('button', { name: 'Quitar niños' });
    expect(minus).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(minus);
    expect(screen.getByText('0, mínimo')).toBeInTheDocument();
    expect(screen.queryByText(/Máximo/)).not.toBeInTheDocument();
  });

  it('teclado: flechas, Home y End', () => {
    render(<Harness editable={false} max={6} start={2} />);
    const spin = screen.getByRole('spinbutton');
    fireEvent.keyDown(spin, { key: 'ArrowUp' });
    expect(spin).toHaveAttribute('aria-valuenow', '3');
    fireEvent.keyDown(spin, { key: 'ArrowDown' });
    fireEvent.keyDown(spin, { key: 'ArrowDown' });
    expect(spin).toHaveAttribute('aria-valuenow', '1');
    fireEvent.keyDown(spin, { key: 'End' });
    expect(spin).toHaveAttribute('aria-valuenow', '6');
    fireEvent.keyDown(spin, { key: 'Home' });
    expect(spin).toHaveAttribute('aria-valuenow', '0');
  });

  it('PageUp/PageDown solo cuando el rango supera 20', () => {
    const { unmount } = render(<Harness editable={false} max={10} start={2} />);
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'PageUp' });
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '2');
    unmount();
    render(<Harness editable max={2000} start={5} />);
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'PageUp' });
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '15');
  });

  it('editable=false no tiene <input>; editable=true sí', () => {
    const { container, unmount } = render(<Harness editable={false} max={6} />);
    expect(container.querySelector('input')).toBeNull();
    expect(screen.getByRole('spinbutton')).toHaveAttribute('tabindex', '0');
    unmount();
    const r = render(<Harness editable max={6} />);
    expect(r.container.querySelector('input')).not.toBeNull();
  });

  it('editable: el borrador válido se aplica en vivo y el excedido se ajusta al salir', () => {
    render(<Harness editable label="Cantidad de alumnos" max={2000} start={8} />);
    const input = screen.getByLabelText('Cantidad de alumnos') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '40' } });
    expect(input.value).toBe('40');
    expect(input).toHaveAttribute('aria-valuenow', '40');
    fireEvent.change(input, { target: { value: '99999' } });
    expect(input).toHaveAttribute('aria-valuenow', '40');
    fireEvent.blur(input);
    expect(input).toHaveAttribute('aria-valuenow', '2000');
    expect(input.value).toBe('2000');
  });

  it('editable: borrador vacío vuelve al valor al salir; Escape descarta', () => {
    render(<Harness editable label="Cantidad" start={8} />);
    const input = screen.getByLabelText('Cantidad') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.blur(input);
    expect(input.value).toBe('8');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('1'); // 1 ya se aplicó en vivo (válido)
  });

  it('hideLabel conserva el nombre accesible', () => {
    render(<Harness editable hideLabel label="Cantidad" />);
    expect(screen.getByLabelText('Cantidad')).toBeInTheDocument();
  });

  it('limitHint=false oculta la nota', () => {
    render(<Harness editable={false} max={3} start={3} limitHint={false} />);
    expect(screen.queryByText(/Máximo/)).not.toBeInTheDocument();
  });

  it('SSR determinístico: el valor se formatea con String() y no anima en el primer render', () => {
    const html = renderToString(
      <NumberField label="Niños" value={1234} onValueChange={() => {}} decrementLabel="-" incrementLabel="+" editable={false} />,
    );
    expect(html).toContain('>1234<');
    expect(html).not.toContain('data-dir');
  });
});
