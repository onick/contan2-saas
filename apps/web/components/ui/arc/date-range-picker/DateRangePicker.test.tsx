import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { DateRangePicker } from './DateRangePicker';

const RANGE = { from: '2026-10-01', to: '2026-10-16' };

beforeEach(() => {
  // Popper (Radix) mide con ResizeObserver, que jsdom no trae.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // Solo fijamos la fecha: 2026-10-16 12:00 en Santo Domingo.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T16:00:00Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const setup = (props: Partial<React.ComponentProps<typeof DateRangePicker>> = {}) => {
  const onChange = vi.fn();
  render(<DateRangePicker value={RANGE} presetKey="mes" onChange={onChange} max="today" maxDays={366} {...props} />);
  return { onChange, trigger: screen.getByRole('button', { name: /^Período/ }) };
};
const open = () => { const t = screen.getByRole('button', { name: /^Período/ }); fireEvent.click(t); return screen.getByRole('dialog', { name: 'Período' }); };
const day = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });

describe('DateRangePicker', () => {
  it('el trigger muestra el atajo y el rango, y se nombra "Período: …"', () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute('aria-label', 'Período: Este mes · 1 – 16 oct 2026');
    expect(screen.getByText('Este mes')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('sin atajo vigente se llama Personalizado', () => {
    const { trigger } = setup({ presetKey: null });
    expect(trigger).toHaveAttribute('aria-label', 'Período: Personalizado · 1 – 16 oct 2026');
  });

  it('abre un dialog con la semana empezando en lunes', () => {
    setup();
    const dialog = open();
    const heads = within(dialog).getAllByRole('columnheader');
    expect(heads.slice(0, 7).map((h) => h.textContent)).toEqual(['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do']);
    expect(within(dialog).getByRole('group', { name: 'Atajos' })).toBeInTheDocument();
    // «hoy» marcado con aria-current
    expect(day('viernes, 16 de octubre de 2026')).toHaveAttribute('aria-current', 'date');
  });

  it('dos clics y Aplicar emiten el rango (sin atajo)', () => {
    const { onChange } = setup();
    open();
    fireEvent.click(day('lunes, 5 de octubre de 2026'));
    fireEvent.click(day('viernes, 9 de octubre de 2026'));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChange).toHaveBeenCalledWith({ from: '2026-10-05', to: '2026-10-09' }, null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clics invertidos se ordenan; un solo clic + Aplicar da un día', () => {
    const { onChange } = setup();
    open();
    fireEvent.click(day('viernes, 9 de octubre de 2026'));
    fireEvent.click(day('lunes, 5 de octubre de 2026'));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-05', to: '2026-10-09' }, null);
    open();
    fireEvent.click(day('martes, 6 de octubre de 2026'));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-06', to: '2026-10-06' }, null);
  });

  it('un atajo + Aplicar emite el rango y su clave', () => {
    const { onChange } = setup();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Mes pasado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChange).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-09-30' }, 'mesPasado');
  });

  it('el atajo coincidente queda aria-pressed', () => {
    setup();
    open();
    expect(screen.getByRole('button', { name: 'Este mes' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Mes pasado' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('el foco entra al día tabbable y ArrowRight lo mueve al día siguiente', () => {
    setup();
    open();
    expect(day('jueves, 1 de octubre de 2026')).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(day('viernes, 2 de octubre de 2026')).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(day('viernes, 9 de octubre de 2026')).toHaveFocus();
  });

  it('PageDown cruza de mes y no pasa de «hoy» (max)', () => {
    setup();
    open();
    fireEvent.keyDown(document.activeElement!, { key: 'PageDown' });
    // 1 oct + 1 mes = 1 nov > hoy (16 oct) → se recorta a hoy
    expect(day('viernes, 16 de octubre de 2026')).toHaveFocus();
  });

  it('Escape cierra y devuelve el foco al trigger', async () => {
    const { trigger } = setup();
    open();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('Cancelar descarta el borrador', () => {
    const { onChange } = setup();
    open();
    fireEvent.click(day('lunes, 5 de octubre de 2026'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('entrada manual Desde/Hasta; 367 días deshabilita Aplicar con aviso', () => {
    setup();
    open();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2025-10-01' } });
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled(); // 2025-10-01 → 2026-10-16 = 381 días
    expect(screen.getByText('Máximo 366 días.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2025-10-17' } }); // 365 días exactos
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled();
  });

  it('Desde posterior a Hasta deshabilita Aplicar', () => {
    setup();
    open();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-16' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-03' } });
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    expect(screen.getByText(/no puede ser posterior/)).toBeInTheDocument();
  });

  it('los días posteriores a «hoy» están deshabilitados con max="today"', () => {
    setup();
    open();
    expect(day('sábado, 17 de octubre de 2026')).toBeDisabled();
  });

  it('SSR: sin «hoy» en el HTML, trigger deshabilitado y etiqueta determinística', () => {
    const html = renderToString(<DateRangePicker value={RANGE} presetKey="mes" onChange={() => {}} max="today" />);
    expect(html).not.toContain('aria-current');
    expect(html).toContain('Período: Este mes · 1 – 16 oct 2026');
    expect(html).toContain('disabled');
  });
  describe('sin rango (value null)', () => {
    it('el trigger muestra el placeholder y se nombra "Período: <placeholder>"', () => {
      const { trigger } = setup({ value: null, presetKey: null, placeholder: 'Elegir fechas' });
      expect(trigger).toHaveAttribute('aria-label', 'Período: Elegir fechas');
      expect(screen.getByText('Elegir fechas')).toBeInTheDocument();
      expect(screen.queryByText('Personalizado')).toBeNull();
    });

    it('placeholder por defecto: Cualquier fecha', () => {
      const { trigger } = setup({ value: null });
      expect(trigger).toHaveAttribute('aria-label', 'Período: Cualquier fecha');
    });

    it('el panel arranca en hoy, sin atajo marcado, y Aplicar emite el rango elegido', () => {
      const { onChange } = setup({ value: null });
      const dialog = open();
      expect(day('viernes, 16 de octubre de 2026')).toHaveAttribute('aria-current', 'date');
      expect(within(dialog).queryByRole('button', { name: 'Quitar fechas' })).toBeNull();
      expect(within(dialog).getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(day('lunes, 5 de octubre de 2026'));
      fireEvent.click(day('viernes, 9 de octubre de 2026'));
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
      expect(onChange).toHaveBeenCalledWith({ from: '2026-10-05', to: '2026-10-09' }, null);
    });
  });

  it('«Quitar fechas» aparece con valor y onClear, llama onClear y cierra', () => {
    const onClear = vi.fn();
    const { onChange } = setup({ onClear });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar fechas' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sin onClear no hay «Quitar fechas»', () => {
    setup();
    open();
    expect(screen.queryByRole('button', { name: 'Quitar fechas' })).toBeNull();
  });
});
