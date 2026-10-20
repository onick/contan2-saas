import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, act, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { DateTimeField, type DateTimeFieldProps } from './DateTimeField';

beforeEach(() => {
  // Popper (Radix) mide con ResizeObserver, que jsdom no trae.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // Solo fijamos la fecha: 2026-10-16 12:00 en Santo Domingo (viernes).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T16:00:00Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function Harness({ initial = '', onChange, ...rest }: { initial?: string; onChange: (v: string) => void } & Partial<DateTimeFieldProps>) {
  const [v, setV] = useState(initial);
  return <DateTimeField id="f" value={v} onChange={(x) => { setV(x); onChange(x); }} {...rest} />;
}
const setup = (initial = '', props: Partial<DateTimeFieldProps> = {}) => {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} {...props} />);
  return { onChange, input: screen.getByRole('textbox') as HTMLInputElement, button: screen.getByRole('button', { name: 'Elegir fecha y hora' }) };
};
const open = () => { fireEvent.click(screen.getByRole('button', { name: 'Elegir fecha y hora' })); return screen.getByRole('dialog', { name: 'Elegir fecha y hora' }); };
const day = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });
const blurWith = (input: HTMLInputElement, text: string) => { fireEvent.focus(input); fireEvent.change(input, { target: { value: text } }); fireEvent.blur(input); };

describe('DateTimeField', () => {
  it('muestra el valor formateado en es-DO y expone ARIA del botón', () => {
    const { input, button } = setup('2026-11-12T19:00');
    expect(input.value).toBe('12/11/2026, 7:00 p. m.');
    expect(input).toHaveAttribute('id', 'f');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('sin valor muestra el placeholder', () => {
    const { input } = setup();
    expect(input).toHaveAttribute('placeholder', 'Seleccionar fecha y hora');
    expect(input.value).toBe('');
  });

  it('abre un dialog, aria-expanded pasa a true, y Escape cierra devolviendo el foco al botón', async () => {
    const { button } = setup('2026-10-20T09:30');
    const dialog = open();
    expect(dialog).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByRole('group', { name: 'Atajos' })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it('abrir sin valor propone hoy a la siguiente media hora, sin emitir', () => {
    const { onChange } = setup();
    const dialog = open();
    expect(onChange).not.toHaveBeenCalled();
    expect(day('viernes, 16 de octubre de 2026')).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByLabelText('Hora')).toHaveValue('12');
    expect(within(dialog).getByLabelText('Minutos')).toHaveValue('30');
    expect(within(dialog).getByRole('radio', { name: 'p. m.' })).toHaveAttribute('aria-checked', 'true');
  });

  it('«Listo» confirma la propuesta cuando no había valor y cierra', () => {
    const { onChange, input } = setup();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(onChange).toHaveBeenCalledWith('2026-10-16T12:30');
    expect(input.value).toBe('16/10/2026, 12:30 p. m.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('elegir día + hora + minutos + p. m. emite YYYY-MM-DDTHH:mm sin cerrar', () => {
    const { onChange } = setup();
    const dialog = open();
    fireEvent.click(day('lunes, 19 de octubre de 2026'));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-19T12:30');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Hora'), { target: { value: '7' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-10-19T19:30');
    fireEvent.change(within(dialog).getByLabelText('Minutos'), { target: { value: '45' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-10-19T19:45');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'a. m.' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-19T07:45');
    expect(screen.getByRole('textbox')).toHaveValue('19/10/2026, 7:45 a. m.');
  });

  it('12 a. m. es medianoche y 12 p. m. mediodía', () => {
    const { onChange } = setup('2026-10-20T09:00');
    const dialog = open();
    fireEvent.change(within(dialog).getByLabelText('Hora'), { target: { value: '12' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-10-20T00:00');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'p. m.' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-20T12:00');
  });

  it('el paso de minutos define las opciones', () => {
    setup('2026-10-20T09:00', { minuteStep: 15 });
    const dialog = open();
    const opts = within(within(dialog).getByLabelText('Minutos')).getAllByRole('option').map((o) => o.textContent);
    expect(opts).toEqual(['00', '15', '30', '45']);
  });

  it('atajos: Mañana y Próximo sábado conservan la hora', () => {
    const { onChange } = setup('2026-10-16T18:15');
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Mañana' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-17T18:15');
    fireEvent.click(screen.getByRole('button', { name: 'Próximo sábado' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-17T18:15'); // hoy es viernes: el próximo sábado es mañana
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-16T18:15');
  });

  it('marca hoy con aria-current y el día elegido como pulsado', () => {
    setup('2026-10-20T09:00');
    open();
    expect(day('viernes, 16 de octubre de 2026')).toHaveAttribute('aria-current', 'date');
    expect(day('martes, 20 de octubre de 2026')).toHaveAttribute('aria-pressed', 'true');
  });

  it('navega de mes con los botones', () => {
    setup('2026-10-20T09:00');
    const dialog = open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mes siguiente' }));
    expect(within(dialog).getByText('noviembre 2026')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mes anterior' }));
    expect(within(dialog).getByText('octubre 2026')).toBeInTheDocument();
  });

  it('las flechas mueven el foco entre días y Enter/clic elige', () => {
    setup('2026-10-20T09:00');
    open();
    const d20 = day('martes, 20 de octubre de 2026');
    d20.focus();
    fireEvent.keyDown(d20, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(day('miércoles, 21 de octubre de 2026'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(day('miércoles, 28 de octubre de 2026'));
  });

  it('las flechas cruzan de mes', () => {
    setup('2026-10-31T09:00');
    open();
    const d = day('sábado, 31 de octubre de 2026');
    d.focus();
    fireEvent.keyDown(d, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(day('domingo, 1 de noviembre de 2026'));
  });

  it('min/max deshabilitan días y botones de mes', () => {
    setup('2026-10-20T09:00', { min: '2026-10-18T08:00', max: '2026-10-22T20:00' });
    const dialog = open();
    expect(day('sábado, 17 de octubre de 2026')).toBeDisabled();
    expect(day('domingo, 18 de octubre de 2026')).toBeEnabled();
    expect(day('jueves, 22 de octubre de 2026')).toBeEnabled();
    expect(day('viernes, 23 de octubre de 2026')).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Mes anterior' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Mes siguiente' })).toBeDisabled();
    // Los atajos fuera de rango también se deshabilitan (hoy 16/10 < min).
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeDisabled();
  });

  it('al elegir el día mínimo, la hora se ajusta al mínimo', () => {
    const { onChange } = setup('2026-10-20T07:00', { min: '2026-10-18T08:00' });
    open();
    fireEvent.click(day('domingo, 18 de octubre de 2026'));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-18T08:00');
  });

  it('Limpiar emite vacío, cierra y devuelve el foco al botón', async () => {
    const { onChange, input, button } = setup('2026-10-20T09:00');
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(onChange).toHaveBeenCalledWith('');
    expect(input.value).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it('Limpiar está deshabilitado sin valor', () => {
    setup();
    open();
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeDisabled();
  });

  describe('escribir', () => {
    it('al perder el foco parsea 12 h y reformatea', () => {
      const { onChange, input } = setup();
      blurWith(input, '3/11/2026 7:05pm');
      expect(onChange).toHaveBeenCalledWith('2026-11-03T19:05');
      expect(input.value).toBe('3/11/2026, 7:05 p. m.');
    });

    it('acepta 24 h con Enter, sin coma', () => {
      const { onChange, input } = setup();
      fireEvent.change(input, { target: { value: '03/11/2026 19:05' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith('2026-11-03T19:05');
      expect(input.value).toBe('3/11/2026, 7:05 p. m.');
    });

    it('un texto inválido restaura el último valor y avisa con role=status y aria-invalid temporal', () => {
      vi.useRealTimers();
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      vi.setSystemTime(new Date('2026-10-16T16:00:00Z'));
      const { onChange, input } = setup('2026-11-12T19:00');
      blurWith(input, 'mañana tal vez');
      expect(onChange).not.toHaveBeenCalled();
      expect(input.value).toBe('12/11/2026, 7:00 p. m.');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('status')).toHaveTextContent('Fecha no válida');
      expect(input.getAttribute('aria-describedby')).toContain(screen.getByRole('status').id);
      act(() => { vi.advanceTimersByTime(3600); });
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('fuera de min/max se trata como inválido', () => {
      const { onChange, input } = setup('', { min: '2026-10-18T08:00' });
      blurWith(input, '1/10/2026 9:00');
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent('Fecha no válida');
    });

    it('borrar todo el texto emite vacío', () => {
      const { onChange, input } = setup('2026-11-12T19:00');
      blurWith(input, '');
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('perder el foco sin editar no emite ni avisa', () => {
      const { onChange, input } = setup('2026-11-12T19:00');
      fireEvent.focus(input);
      fireEvent.blur(input);
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });
  });

  it('propaga required, disabled, invalid y aria-describedby', () => {
    const { input, button } = setup('', { required: true, disabled: true, invalid: true, 'aria-describedby': 'ayuda' });
    expect(input).toBeRequired();
    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'ayuda');
  });

  it('respeta aria-invalid del padre', () => {
    const { input } = setup('', { 'aria-invalid': true });
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
